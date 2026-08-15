import { type ModuleKey, isModuleActive as isActiveByLayers } from '@molho/contracts';
import { type ModuleCache, noopModuleCache } from './module-cache';
import { type ModuleDataSource } from './module-data-source';
import { type ModuleLogger, consoleModuleLogger } from './module-logger';
import { type ModuleRegistry, contractsModuleRegistry } from './module-registry';

const CACHE_TTL_SECONDS = 60;

export interface ModuleServiceDeps {
  db: ModuleDataSource;
  /** Camada Redis (TTL curto). Sem Redis configurado, usa noopModuleCache. */
  cache?: ModuleCache;
  registry?: ModuleRegistry;
  logger?: ModuleLogger;
}

function redisKey(tenantId: string, moduleKey: string): string {
  return `module:${tenantId}:${moduleKey}`;
}

/** Breakdown das 3 camadas (§5-B.1) — pro painel de admin, não só o booleano final. */
export interface ModuleState {
  entitled: boolean;
  enabled: boolean;
  released: boolean;
  active: boolean;
}

/**
 * Responde "esse módulo está ativo pra esse tenant?" (entitled AND enabled
 * AND released, ver packages/contracts/modules.ts). Uma instância = um
 * request: o Map interno memoiza por (tenantId, moduleKey) dentro da própria
 * instância, então N checagens do mesmo módulo no mesmo request batem
 * banco/Redis 1x. Memoiza a PROMISE (não só o valor resolvido) — duas
 * chamadas concorrentes pro mesmo módulo, antes da primeira resolver,
 * dividem o mesmo request, sem stampede.
 */
export class ModuleService {
  private readonly db: ModuleDataSource;
  private readonly cache: ModuleCache;
  private readonly registry: ModuleRegistry;
  private readonly logger: ModuleLogger;
  private readonly requestCache = new Map<string, Promise<boolean>>();

  constructor(deps: ModuleServiceDeps) {
    this.db = deps.db;
    this.cache = deps.cache ?? noopModuleCache;
    this.registry = deps.registry ?? contractsModuleRegistry;
    this.logger = deps.logger ?? consoleModuleLogger;
  }

  isModuleActive(tenantId: string, moduleKey: ModuleKey): Promise<boolean> {
    const key = `${tenantId}:${moduleKey}`;
    let pending = this.requestCache.get(key);
    if (!pending) {
      pending = this.compute(tenantId, moduleKey);
      this.requestCache.set(key, pending);
    }
    return pending;
  }

  /**
   * Breakdown pro painel de super-admin: "por que não tá ativo" importa, não
   * só o booleano final. `active` reusa o MESMO cálculo de `isModuleActive`
   * (recursão de `requires`, cache incluso); entitled/enabled/released são
   * lidos direto, sem cache — painel é baixo volume, quer o valor fresco
   * logo depois de um PUT.
   */
  async getModuleState(tenantId: string, moduleKey: ModuleKey): Promise<ModuleState> {
    const def = this.registry.moduleDef(moduleKey);
    if (def.core) return { entitled: true, enabled: true, released: true, active: true };

    const [active, entitlement, setting, flag] = await Promise.all([
      this.isModuleActive(tenantId, moduleKey),
      this.db.getEntitlement(tenantId, moduleKey),
      this.db.getSetting(tenantId, moduleKey),
      this.db.getFlag(moduleKey),
    ]);
    return {
      entitled: entitlement !== null && entitlement.status !== 'suspended',
      enabled: setting?.enabled === true,
      released: !flag || flag.enabled,
      active,
    };
  }

  async getModuleStates(tenantId: string): Promise<Record<ModuleKey, ModuleState>> {
    const entries = await Promise.all(
      this.registry.MODULE_KEYS.map(async (key) => [key, await this.getModuleState(tenantId, key)] as const),
    );
    return Object.fromEntries(entries) as Record<ModuleKey, ModuleState>;
  }

  async listActiveModules(tenantId: string): Promise<ModuleKey[]> {
    const entries = await Promise.all(
      this.registry.MODULE_KEYS.map(
        async (key) => [key, await this.isModuleActive(tenantId, key)] as const,
      ),
    );
    return entries.filter(([, active]) => active).map(([key]) => key);
  }

  /** Chamado por quem MUTA tenant_entitlements/tenant_settings/feature_flags. */
  async invalidate(tenantId: string, moduleKey?: ModuleKey): Promise<void> {
    const keys = moduleKey ? [moduleKey] : this.registry.MODULE_KEYS;
    for (const key of keys) {
      this.requestCache.delete(`${tenantId}:${key}`);
      await this.cache.del(redisKey(tenantId, key));
    }
  }

  private async compute(tenantId: string, moduleKey: ModuleKey): Promise<boolean> {
    const def = this.registry.moduleDef(moduleKey);
    if (def.core) return true;

    for (const req of def.requires ?? []) {
      if (!this.registry.isModuleKey(req)) continue; // registry já valida isto em teste próprio
      if (!(await this.isModuleActive(tenantId, req))) {
        this.logger.warn('module_requires_not_satisfied', { tenantId, moduleKey, missing: req });
        return false;
      }
    }

    const cacheKey = redisKey(tenantId, moduleKey);
    const cached = await this.cache.get(cacheKey);
    if (cached !== null) return cached;

    const [entitlement, setting, flag] = await Promise.all([
      this.db.getEntitlement(tenantId, moduleKey),
      this.db.getSetting(tenantId, moduleKey),
      this.db.getFlag(moduleKey),
    ]);

    const entitled = entitlement !== null && entitlement.status !== 'suspended';
    const enabled = setting?.enabled === true;
    const released = !flag || flag.enabled;

    const active = isActiveByLayers({ entitled, enabled, released });
    await this.cache.set(cacheKey, active, CACHE_TTL_SECONDS);
    return active;
  }
}
