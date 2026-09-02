import { describe, expect, it } from 'vitest';
import {
  MODULES,
  MODULE_KEYS,
  PLANS,
  defaultModulesForPlan,
  isModuleActive,
  isModuleKey,
  missingRequirements,
  moduleDef,
  planGrants,
  validateModuleRegistry,
} from './modules';

describe('coerência do registry', () => {
  it('o registry inteiro é coerente (requires existem, sem ciclo, planos batem)', () => {
    expect(validateModuleRegistry()).toEqual([]);
  });

  it('só existem os 3 planos decididos (D2: standard/pro/premium)', () => {
    expect(PLANS).toEqual(['standard', 'pro', 'premium']);

    for (const key of MODULE_KEYS) {
      for (const plan of moduleDef(key).plans ?? []) {
        expect(PLANS).toContain(plan);
      }
    }
  });

  it('core é exatamente catalog, orders e customers', () => {
    const cores = MODULE_KEYS.filter((k) => moduleDef(k).core === true);
    expect(cores.sort()).toEqual(['catalog', 'customers', 'orders']);
  });

  // Regra do MVP: fora do escopo = registrado como módulo DESLIGADO, nunca
  // ausente. Se alguém "limpar" o registry, este teste segura.
  it('os módulos fora do MVP existem no registry (desligados, não apagados)', () => {
    const foraDoMvp = [
      'coupons',
      'promotions',
      'combos',
      'loyalty',
      'reviews',
      'campaigns',
      'pdv',
      'cash_register',
      'kds',
      'tables',
      'channel.waiter_app',
      'delivery.courier_app',
      'channel.ifood',
      'fiscal.nfce',
      'franchise',
      'payments.card_online',
    ];

    for (const key of foraDoMvp) {
      expect(isModuleKey(key), `"${key}" sumiu do registry`).toBe(true);
    }
  });
});

describe('planos × módulos (alinhado à tabela de preços da definições-v1 §4)', () => {
  it('standard tem o essencial do delivery próprio', () => {
    expect(planGrants('standard', 'channel.storefront')).toBe(true);
    expect(planGrants('standard', 'delivery.zones')).toBe(true);
    expect(planGrants('standard', 'printing.escpos')).toBe(true);
    expect(planGrants('standard', 'payments.pix_static')).toBe(true);
    expect(planGrants('standard', 'notify.whatsapp_ctc')).toBe(true);
  });

  it('coupons/combos/reviews/loyalty (código completo) são de todo plano; promoções (sem código) continua Pro+; PDV/KDS/mesas/iFood/campanhas são Premium', () => {
    // Decisão do PM (2026-09-02): sem tiering por ora — feature com código
    // completo nasce ligada em qualquer plano. `promotions` segue Pro+
    // porque não tem código nenhum ainda (nada a "ligar").
    for (const key of ['coupons', 'combos', 'reviews', 'loyalty'] as const) {
      expect(planGrants('standard', key), `${key} é do standard`).toBe(true);
    }
    for (const key of ['promotions'] as const) {
      expect(planGrants('standard', key), `${key} não é do standard`).toBe(false);
      expect(planGrants('pro', key), `${key} é do pro`).toBe(true);
    }
    for (const key of ['pdv', 'kds', 'tables', 'channel.ifood', 'campaigns'] as const) {
      expect(planGrants('pro', key), `${key} não é do pro`).toBe(false);
      expect(planGrants('premium', key), `${key} é do premium`).toBe(true);
    }
  });

  it('add-on nunca vem do plano — NFC-e se contrata à parte em qualquer plano', () => {
    for (const plan of PLANS) {
      expect(planGrants(plan, 'fiscal.nfce')).toBe(false);
    }
    expect(moduleDef('fiscal.nfce').priceLabel).toBe('R$ 39,90/mês');
  });

  it('core vale em todo plano', () => {
    for (const plan of PLANS) {
      expect(planGrants(plan, 'orders')).toBe(true);
    }
  });
});

describe('provisionamento', () => {
  it('tenant standard nasce com os defaults do MVP, sem nada de plano maior', () => {
    const ligados = defaultModulesForPlan('standard');

    expect(ligados).toEqual(
      expect.arrayContaining([
        'catalog',
        'orders',
        'customers',
        'channel.storefront',
        'notify.whatsapp_ctc',
        'delivery.zones',
        'printing.escpos',
        'payments.pix_static',
        'payments.on_delivery',
        'dashboard.basic',
        'coupons',
        'combos',
        'reviews',
        'loyalty',
      ]),
    );
    expect(ligados).not.toContain('promotions');
    expect(ligados).not.toContain('pdv');
    expect(ligados).not.toContain('fiscal.nfce');
  });

  it('checkout.guest NÃO nasce ligado em nenhum plano — quem assume o risco do telefone auto-declarado é o lojista', () => {
    for (const plan of PLANS) {
      expect(defaultModulesForPlan(plan)).not.toContain('checkout.guest');
    }
  });

  it('módulo external não nasce ligado nem no premium (exige conectar credencial)', () => {
    expect(defaultModulesForPlan('premium')).not.toContain('channel.ifood');
    expect(defaultModulesForPlan('premium')).not.toContain('payments.pix_online');
  });
});

describe('dependências', () => {
  it('cash_register sem pdv acusa a dependência', () => {
    expect(missingRequirements('cash_register', new Set())).toEqual(['pdv']);
    expect(missingRequirements('cash_register', new Set(['pdv']))).toEqual([]);
  });

  it('live_map exige o app do entregador', () => {
    expect(missingRequirements('delivery.live_map', new Set())).toEqual([
      'delivery.courier_app',
    ]);
  });

  // Comportamento documentado, não garantia de recursão: hoje nenhum módulo
  // do registry tem uma cadeia de dois níveis (o requires de um módulo nunca
  // tem, por sua vez, um requires). missingRequirements devolve só o pai
  // DIRETO — não expande a cadeia transitiva. Se um dia um módulo com
  // requires vier a exigir outro que também tem requires, este teste falha e
  // é o sinal para trocar a filtragem por uma busca transitiva.
  it('hoje devolve só o requisito direto, sem expandir a cadeia (revisitar se surgir dependência de dois níveis)', () => {
    expect(moduleDef('pdv').requires ?? []).toEqual([]);
    expect(missingRequirements('pdv.mobile', new Set())).toEqual(['pdv']);
  });
});

describe('as três camadas (entitled AND enabled AND released)', () => {
  it.each([
    [{ entitled: true, enabled: true, released: true }, true],
    [{ entitled: false, enabled: true, released: true }, false],
    [{ entitled: true, enabled: false, released: true }, false],
    [{ entitled: true, enabled: true, released: false }, false],
  ])('%o → %s', (state, esperado) => {
    expect(isModuleActive(state)).toBe(esperado);
  });
});

describe('guarda de chaves', () => {
  it('isModuleKey aceita chave real e recusa inventada', () => {
    expect(isModuleKey('loyalty')).toBe(true);
    expect(isModuleKey('modulo.que.nao.existe')).toBe(false);
  });

  it('MODULES não ganhou chave duplicada por acidente', () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
    expect(Object.keys(MODULES).length).toBeGreaterThanOrEqual(30);
  });
});
