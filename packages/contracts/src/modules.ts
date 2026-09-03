/**
 * Registry de módulos — fonte única da verdade (docs/01-plano-produto.md §5-B).
 *
 * Toda capability do produto é um módulo com chave estável. Backend, UI, billing
 * e o painel de provisionamento leem DAQUI; no banco, module_key é TEXT sem
 * enum — módulo novo não gera migration, e um teste de sincronização garante
 * que nada gravado no banco aponte para chave inexistente.
 *
 * Uma feature só roda se `entitled AND enabled AND released` (§5-B.1):
 *   entitlement — direito, vem do plano/add-on, controlado pelo super-admin
 *   setting     — o lojista liga/desliga o que tem direito
 *   release     — flag de engenharia (rollout)
 *
 * Os módulos fora do MVP (cupons, PDV, KDS, iFood…) EXISTEM aqui de propósito:
 * a regra é registrá-los desligados, nunca implementá-los antes da fase deles.
 */

export const PLANS = ['standard', 'pro', 'premium'] as const;
export type Plan = (typeof PLANS)[number];

export interface ModuleDef {
  /** Sempre ligado, não desligável, presente em todo plano. */
  core?: true;
  /** Planos que dão direito ao módulo. */
  plans?: readonly Plan[];
  /** Ligado por padrão ao provisionar (dentro dos planos que dão direito). */
  default?: boolean;
  /** Dependências: bloqueia habilitar sem elas (chaves deste registry). */
  requires?: readonly string[];
  /** Cobrado à parte, independe do plano. */
  addon?: boolean;
  /** Preço exibido do add-on. */
  priceLabel?: string;
  /** Exige credencial de terceiro (tem estado conectado/pendente). */
  external?: boolean;
  /** Uso cobrado (ex.: mensagens de campanha). */
  metered?: boolean;
  /** Restrito a um tipo de tenant. */
  tenantType?: 'franchisor';
}

export const MODULES = {
  // ─── Core — sempre ligado, não desligável ───────────────────────────────────
  catalog: { core: true },
  orders: { core: true },
  customers: { core: true },

  // ─── Canais de venda ────────────────────────────────────────────────────────
  'channel.storefront': { plans: PLANS, default: true },
  // Checkout SEM OTP (Épico 9c). O nome aponta pra ponta PERMISSIVA de
  // propósito: sem linha em tenant_settings o registry responde `false`, ou
  // seja OTP exigido — fail-closed por construção. Um `checkout.require_otp`
  // desligaria a verificação por esquecimento de provisionamento.
  // `default: false` mesmo dentro do plano: é o lojista que assume o risco de
  // pedido com telefone auto-declarado, nunca o provisionamento por nós.
  // Ver CLAUDE.md regra 13 (EMENDA) pras invariantes que ele NÃO afrouxa.
  'checkout.guest': { plans: PLANS, default: false, requires: ['channel.storefront'] },
  'channel.qrcode_table': { plans: ['premium'], requires: ['tables'] },
  'channel.waiter_app': { plans: ['premium'], requires: ['tables'] },
  'channel.ifood': { plans: ['premium'], external: true },
  'channel.whatsapp_bot': { plans: ['pro', 'premium'], external: true },
  'notify.whatsapp_ctc': { plans: PLANS, default: true },

  // ─── Operação ───────────────────────────────────────────────────────────────
  pdv: { plans: ['premium'] },
  'pdv.mobile': { plans: ['premium'], requires: ['pdv'] },
  cash_register: { plans: ['premium'], requires: ['pdv'] },
  kds: { plans: ['premium'] },
  tables: { plans: ['premium'] },
  'delivery.zones': { plans: PLANS, default: true },
  'delivery.courier_app': { plans: ['pro', 'premium'] },
  'delivery.live_map': { plans: ['pro', 'premium'], requires: ['delivery.courier_app'] },
  'printing.escpos': { plans: PLANS, default: true },

  // ─── Pagamentos ─────────────────────────────────────────────────────────────
  'payments.pix_static': { plans: PLANS, default: true },
  'payments.pix_online': { plans: PLANS, external: true },
  'payments.card_online': { plans: ['pro', 'premium'], external: true },
  'payments.on_delivery': { plans: PLANS, default: true },

  // ─── Crescimento ────────────────────────────────────────────────────────────
  // Decisão do PM (2026-09-02): sem tiering de plano por ora — toda feature
  // com código completo (back+front) nasce ligada em QUALQUER plano.
  // `plans` continua com os 3 pra quando a segmentação pro/premium voltar;
  // só troca quando essa decisão for revertida, nunca junto de outra mudança.
  coupons: { plans: PLANS, default: true },
  // [15-D1] resolvido junto com o resto do épico (2026-09-03): alinha com
  // coupons/combos/loyalty/reviews acima — código completo, nasce ligado.
  promotions: { plans: PLANS, default: true },
  // Exceção MVP 2026-08-28 (CLAUDE.md): combo entra no MVP fora de ordem.
  // `default: true` = nasce ligado em todo tenant com direito.
  combos: { plans: PLANS, default: true },
  loyalty: { plans: PLANS, default: true },
  // Sem tiering por ora (mesma decisão de coupons/combos): código completo,
  // nasce ligado em qualquer plano.
  reviews: { plans: PLANS, default: true },
  campaigns: { plans: ['premium'], metered: true },

  // ─── Gestão ─────────────────────────────────────────────────────────────────
  'dashboard.basic': { plans: PLANS, default: true },
  'dashboard.advanced': { plans: ['pro', 'premium'] },
  'fiscal.nfce': { addon: true, priceLabel: 'R$ 39,90/mês', external: true },
  multi_store: { plans: ['premium'] },
  franchise: { plans: ['premium'], tenantType: 'franchisor' },
} as const satisfies Record<string, ModuleDef>;

export type ModuleKey = keyof typeof MODULES;

export const MODULE_KEYS = Object.keys(MODULES) as readonly ModuleKey[];

export function isModuleKey(key: string): key is ModuleKey {
  return Object.hasOwn(MODULES, key);
}

/** Acesso tipado — indexar MODULES direto devolve o literal, não o contrato. */
export function moduleDef(key: ModuleKey): ModuleDef {
  return MODULES[key];
}

/** O plano dá direito ao módulo? Add-on nunca vem do plano: contrata à parte. */
export function planGrants(plan: Plan, key: ModuleKey): boolean {
  const def = moduleDef(key);
  if (def.core) return true;
  if (def.addon) return false;
  return def.plans?.includes(plan) ?? false;
}

/** Módulos que nascem ligados ao provisionar um tenant no plano dado. */
export function defaultModulesForPlan(plan: Plan): ModuleKey[] {
  return MODULE_KEYS.filter((key) => {
    const def = moduleDef(key);
    return def.core === true || (def.default === true && planGrants(plan, key));
  });
}

/** A regra das três camadas (§5-B.1): entitled AND enabled AND released. */
export function isModuleActive(state: {
  entitled: boolean;
  enabled: boolean;
  released: boolean;
}): boolean {
  return state.entitled && state.enabled && state.released;
}

/** Dependências ainda não habilitadas — vazio = pode ligar. */
export function missingRequirements(
  key: ModuleKey,
  enabled: ReadonlySet<string>,
): ModuleKey[] {
  const requires = moduleDef(key).requires ?? [];
  return requires.filter((req): req is ModuleKey => isModuleKey(req) && !enabled.has(req));
}

/**
 * Valida a coerência interna do registry. Roda em teste: registry quebrado
 * reprova o build, não chega em runtime.
 */
export function validateModuleRegistry(): string[] {
  const errors: string[] = [];

  for (const key of MODULE_KEYS) {
    const def = moduleDef(key);

    if (def.core && (def.plans || def.addon)) {
      errors.push(`${key}: core não combina com plans/addon`);
    }
    if (!def.core && !def.addon && (!def.plans || def.plans.length === 0)) {
      errors.push(`${key}: precisa de core, plans ou addon`);
    }
    if (def.addon && !def.priceLabel) {
      errors.push(`${key}: addon sem priceLabel`);
    }

    for (const req of def.requires ?? []) {
      if (!isModuleKey(req)) {
        errors.push(`${key}: requires aponta para módulo inexistente "${req}"`);
        continue;
      }
      // Coerência de planos: se o plano dá direito a A e A requer B, o mesmo
      // plano precisa dar direito a B — senão o lojista compra algo que não
      // consegue ligar.
      for (const plan of def.plans ?? []) {
        if (!planGrants(plan, req)) {
          errors.push(`${key}: plano "${plan}" dá o módulo mas não dá a dependência "${req}"`);
        }
      }
    }
  }

  // Ciclos de requires (A→B→A travaria os dois para sempre).
  const visitado = new Set<string>();
  const emPilha = new Set<string>();
  const temCiclo = (key: ModuleKey): boolean => {
    if (visitado.has(key)) return false;
    if (emPilha.has(key)) return true;
    emPilha.add(key);
    for (const req of moduleDef(key).requires ?? []) {
      if (isModuleKey(req) && temCiclo(req)) return true;
    }
    emPilha.delete(key);
    visitado.add(key);
    return false;
  };
  for (const key of MODULE_KEYS) {
    if (temCiclo(key)) {
      errors.push(`${key}: ciclo de requires`);
      break;
    }
  }

  return errors;
}
