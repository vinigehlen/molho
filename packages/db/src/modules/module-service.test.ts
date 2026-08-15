import type { ModuleDef, ModuleKey } from '@molho/contracts';
import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import type { ModuleCache } from './module-cache';
import { RedisModuleCache, noopModuleCache } from './module-cache';
import type { EntitlementRow, FlagRow, ModuleDataSource, SettingRow } from './module-data-source';
import type { ModuleRegistry } from './module-registry';
import { ModuleService } from './module-service';

// As chaves reais de @molho/contracts servem de "nomes emprestados" — o
// registry é fake (injetado), então o requires-graph abaixo não precisa
// bater com o significado de produto de nenhuma delas.
const CORE: ModuleKey = 'catalog';
const A: ModuleKey = 'coupons';
const B: ModuleKey = 'promotions';
const C: ModuleKey = 'loyalty';
const PLAIN: ModuleKey = 'reviews';

function registry(defs: Partial<Record<ModuleKey, ModuleDef>>): ModuleRegistry {
  const keys = Object.keys(defs) as ModuleKey[];
  return {
    MODULE_KEYS: keys,
    moduleDef: (key) => {
      const def = defs[key];
      if (!def) throw new Error(`sem def de teste para "${key}"`);
      return def;
    },
    isModuleKey: (key): key is ModuleKey => keys.includes(key as ModuleKey),
  };
}

class FakeDataSource implements ModuleDataSource {
  entitlements = new Map<string, EntitlementRow>();
  settings = new Map<string, SettingRow>();
  flags = new Map<string, FlagRow>();
  calls = { entitlement: 0, setting: 0, flag: 0 };

  key(tenantId: string, moduleKey: string) {
    return `${tenantId}:${moduleKey}`;
  }

  setEntitled(tenantId: string, moduleKey: string, status: EntitlementRow['status'] = 'active') {
    this.entitlements.set(this.key(tenantId, moduleKey), { status });
  }

  setEnabled(tenantId: string, moduleKey: string, enabled: boolean) {
    this.settings.set(this.key(tenantId, moduleKey), { enabled });
  }

  setFlag(moduleKey: string, enabled: boolean) {
    this.flags.set(moduleKey, { enabled });
  }

  async getEntitlement(tenantId: string, moduleKey: string) {
    this.calls.entitlement++;
    return this.entitlements.get(this.key(tenantId, moduleKey)) ?? null;
  }

  async getSetting(tenantId: string, moduleKey: string) {
    this.calls.setting++;
    return this.settings.get(this.key(tenantId, moduleKey)) ?? null;
  }

  async getFlag(moduleKey: string) {
    this.calls.flag++;
    return this.flags.get(moduleKey) ?? null;
  }
}

class FakeCache implements ModuleCache {
  store = new Map<string, boolean>();
  async get(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  async set(key: string, value: boolean) {
    this.store.set(key, value);
  }
  async del(key: string) {
    this.store.delete(key);
  }
}

const TENANT = 'tenant-1';

describe('ModuleService — as 3 camadas', () => {
  it('1) entitled + enabled + released → true', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, PLAIN);
    db.setEnabled(TENANT, PLAIN, true);
    db.setFlag(PLAIN, true);
    const svc = new ModuleService({ db, registry: registry({ [PLAIN]: { plans: ['pro'] } }) });

    expect(await svc.isModuleActive(TENANT, PLAIN)).toBe(true);
  });

  it('2) entitled + disabled + released → false (lojista desligou)', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, PLAIN);
    db.setEnabled(TENANT, PLAIN, false);
    const svc = new ModuleService({ db, registry: registry({ [PLAIN]: { plans: ['pro'] } }) });

    expect(await svc.isModuleActive(TENANT, PLAIN)).toBe(false);
  });

  it('3) not entitled + enabled + released → false (não tem plano)', async () => {
    const db = new FakeDataSource();
    db.setEnabled(TENANT, PLAIN, true);
    const svc = new ModuleService({ db, registry: registry({ [PLAIN]: { plans: ['pro'] } }) });

    expect(await svc.isModuleActive(TENANT, PLAIN)).toBe(false);
  });

  it('4) entitled + enabled + released=false → false (feature flag off)', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, PLAIN);
    db.setEnabled(TENANT, PLAIN, true);
    db.setFlag(PLAIN, false);
    const svc = new ModuleService({ db, registry: registry({ [PLAIN]: { plans: ['pro'] } }) });

    expect(await svc.isModuleActive(TENANT, PLAIN)).toBe(false);
  });

  it('5) módulo core → true sempre, mesmo sem entitlement', async () => {
    const db = new FakeDataSource(); // nada setado — sem entitlement, sem setting
    const svc = new ModuleService({ db, registry: registry({ [CORE]: { core: true } }) });

    expect(await svc.isModuleActive(TENANT, CORE)).toBe(true);
    expect(db.calls.entitlement).toBe(0); // core nem toca o banco
  });

  it('6) requires não satisfeito → false, com log de warning', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, A);
    db.setEnabled(TENANT, A, true);
    db.setFlag(A, true);
    // B (requisito de A) não tem entitlement nenhum.
    const warn = vi.fn();
    const svc = new ModuleService({
      db,
      registry: registry({ [A]: { plans: ['pro'], requires: [B] }, [B]: { plans: ['pro'] } }),
      logger: { warn },
    });

    expect(await svc.isModuleActive(TENANT, A)).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      'module_requires_not_satisfied',
      expect.objectContaining({ tenantId: TENANT, moduleKey: A, missing: B }),
    );
  });

  it('7) cadeia transitiva A→B→C: C desabilitado derruba A, e nada fica cacheado como true', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, A);
    db.setEnabled(TENANT, A, true);
    db.setFlag(A, true);
    db.setEntitled(TENANT, B);
    db.setEnabled(TENANT, B, true);
    db.setFlag(B, true);
    // C existe mas está desligado pelo lojista.
    db.setEntitled(TENANT, C);
    db.setEnabled(TENANT, C, false);

    const cache = new FakeCache();
    const svc = new ModuleService({
      db,
      cache,
      registry: registry({
        [A]: { plans: ['pro'], requires: [B] },
        [B]: { plans: ['pro'], requires: [C] },
        [C]: { plans: ['pro'] },
      }),
    });

    expect(await svc.isModuleActive(TENANT, A)).toBe(false);
    expect([...cache.store.values()]).not.toContain(true);
    expect(cache.store.get(`module:${TENANT}:${C}`)).toBe(false);
  });

  it('8) duas chamadas ao mesmo módulo no mesmo request → 1 query no banco', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, PLAIN);
    db.setEnabled(TENANT, PLAIN, true);
    const svc = new ModuleService({ db, registry: registry({ [PLAIN]: { plans: ['pro'] } }) });

    const [first, second] = await Promise.all([
      svc.isModuleActive(TENANT, PLAIN),
      svc.isModuleActive(TENANT, PLAIN),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(db.calls.entitlement).toBe(1);
    expect(db.calls.setting).toBe(1);

    // uma 3ª chamada sequencial, ainda na mesma instância (mesmo request),
    // também não bate no banco de novo — é o cache de request memoizado.
    await svc.isModuleActive(TENANT, PLAIN);
    expect(db.calls.entitlement).toBe(1);
  });

  it('9) Redis inatingível → fallback silencioso pro banco, warning logado, resultado correto', async () => {
    const brokenRedis = {
      get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      set: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      del: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as Redis;

    const warn = vi.fn();
    const cache = new RedisModuleCache(brokenRedis, { warn });

    const db = new FakeDataSource();
    db.setEntitled(TENANT, PLAIN);
    db.setEnabled(TENANT, PLAIN, true);
    const svc = new ModuleService({ db, cache, registry: registry({ [PLAIN]: { plans: ['pro'] } }) });

    const result = await svc.isModuleActive(TENANT, PLAIN);

    expect(result).toBe(true); // resposta correta via banco, apesar do Redis quebrado
    expect(warn).toHaveBeenCalledWith('redis_down_falling_back_to_db', expect.anything());
  });
});

describe('ModuleService — listActiveModules', () => {
  it('lista só os módulos ativos do tenant, ignora o resto', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, A);
    db.setEnabled(TENANT, A, true);
    // B não tem entitlement.
    const svc = new ModuleService({
      db,
      registry: registry({ [CORE]: { core: true }, [A]: { plans: ['pro'] }, [B]: { plans: ['pro'] } }),
    });

    expect(await svc.listActiveModules(TENANT)).toEqual(expect.arrayContaining([CORE, A]));
    expect(await svc.listActiveModules(TENANT)).not.toContain(B);
  });
});

describe('ModuleService — invalidate', () => {
  it('limpa o cache de request e o Redis pro tenant', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, PLAIN);
    db.setEnabled(TENANT, PLAIN, true);
    const cache = new FakeCache();
    const svc = new ModuleService({ db, cache, registry: registry({ [PLAIN]: { plans: ['pro'] } }) });

    expect(await svc.isModuleActive(TENANT, PLAIN)).toBe(true);
    expect(db.calls.entitlement).toBe(1);

    db.setEnabled(TENANT, PLAIN, false); // lojista desligou
    await svc.invalidate(TENANT, PLAIN);

    expect(await svc.isModuleActive(TENANT, PLAIN)).toBe(false);
    expect(db.calls.entitlement).toBe(2); // reconsultou — não ficou preso ao cache antigo
  });
});

describe('ModuleService — getModuleState/getModuleStates (breakdown pro painel)', () => {
  it('core: entitled/enabled/released/active sempre true, sem tocar o banco', async () => {
    const db = new FakeDataSource();
    const svc = new ModuleService({ db, registry: registry({ [CORE]: { core: true } }) });

    expect(await svc.getModuleState(TENANT, CORE)).toEqual({
      entitled: true,
      enabled: true,
      released: true,
      active: true,
    });
    expect(db.calls.entitlement).toBe(0);
  });

  it('entitled mas desligado pelo lojista: breakdown mostra ONDE parou', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, PLAIN);
    db.setEnabled(TENANT, PLAIN, false);
    const svc = new ModuleService({ db, registry: registry({ [PLAIN]: { plans: ['pro'] } }) });

    expect(await svc.getModuleState(TENANT, PLAIN)).toEqual({
      entitled: true,
      enabled: false,
      released: true,
      active: false,
    });
  });

  it('sem nenhuma linha de entitlement: entitled=false, status nunca vira "sempre true por engano"', async () => {
    const db = new FakeDataSource();
    const svc = new ModuleService({ db, registry: registry({ [PLAIN]: { plans: ['pro'] } }) });

    expect(await svc.getModuleState(TENANT, PLAIN)).toEqual({
      entitled: false,
      enabled: false,
      released: true,
      active: false,
    });
  });

  it('getModuleStates: um estado por chave do registry', async () => {
    const db = new FakeDataSource();
    db.setEntitled(TENANT, A);
    db.setEnabled(TENANT, A, true);
    const svc = new ModuleService({
      db,
      registry: registry({ [CORE]: { core: true }, [A]: { plans: ['pro'] }, [PLAIN]: { plans: ['pro'] } }),
    });

    const states = await svc.getModuleStates(TENANT);

    expect(Object.keys(states).sort()).toEqual([A, CORE, PLAIN].sort());
    expect(states[A]).toEqual({ entitled: true, enabled: true, released: true, active: true });
    expect(states[PLAIN]).toEqual({ entitled: false, enabled: false, released: true, active: false });
  });
});

describe('noopModuleCache', () => {
  it('sempre é miss e nunca lança — usado quando Redis não está configurado', async () => {
    await expect(noopModuleCache.get('x')).resolves.toBeNull();
    await expect(noopModuleCache.set('x', true, 60)).resolves.toBeUndefined();
    await expect(noopModuleCache.del('x')).resolves.toBeUndefined();
  });
});
