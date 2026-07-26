/**
 * RBAC com escopo — fonte única da verdade (docs/01-plano-produto.md §5-C).
 *
 * Permissão é granular; papel é atalho (um conjunto de permissões). O código
 * SEMPRE checa `can(actor, 'permissao', escopo)` — `if (role === 'x')` é
 * proibido, e é isto que permite papéis customizados por tenant no futuro
 * sem refactor.
 *
 * O `△` da matriz (§5-C.5) vira `approval: true`: a permissão existe, mas a
 * ação exige aprovação por PIN do manager, registrada em audit_log. Isso é
 * controle de fraude, não burocracia.
 *
 * Este arquivo é puro: sem banco, sem Nest. A dupla checagem em runtime
 * (@RequireModule + @RequirePermission) e o RLS são camadas SEPARADAS —
 * nenhuma substitui a outra.
 */

export const SCOPE_TYPES = ['platform', 'franchise', 'tenant', 'store'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const PERMISSIONS = [
  // Catálogo
  'catalog.category.create',
  'catalog.category.update',
  'catalog.category.delete',
  'catalog.product.create',
  'catalog.product.update',
  'catalog.product.delete',
  /** Separada de product.update: cashier marca esgotado sem poder editar preço (§5-C.5). */
  'catalog.product.mark_unavailable',
  'catalog.import',
  // Pedidos
  'order.create',
  'order.update_status',
  'order.manual_discount',
  'order.cancel_paid',
  // Pagamentos
  /** PIX estático confirmado manualmente (Épico 8) — dinheiro ENTRANDO, por isso sem approval (§5-C.5 não lista esta ação; ver ROLE_PERMISSIONS pro racional). */
  'payment.confirm',
  'payment.refund',
  // Caixa
  'cash.open_close',
  'cash.withdraw',
  // Entrega
  'delivery.dispatch',
  'delivery.update_status',
  // Relatórios
  'report.revenue.view',
  'report.margin.view',
  // Fiscal
  'invoice.issue',
  // Crescimento
  'growth.manage',
  'campaign.send',
  'customer.export',
  // Administração do tenant
  'team.manage',
  'module.toggle',
  'billing.manage',
  // Franquia
  'franchise.manage',
  'franchise.report.view',
  // Plataforma (internos Molho)
  'platform.tenant.provision',
  'platform.module.toggle',
  'platform.billing.manage',
  'platform.flags.manage',
  'platform.impersonate.read',
  'platform.impersonate.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export const ROLES = [
  // Internos Molho
  'platform_owner',
  'platform_support',
  'platform_finance',
  'platform_engineer',
  // Lojista
  'owner',
  'manager',
  'cashier',
  'waiter',
  'kitchen',
  'courier',
  'accountant',
  'marketing',
  // Franquia
  'franchisor_owner',
  'franchisor_analyst',
  // Cliente final (não é usuário do backoffice)
  'customer',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

interface GrantMeta {
  /** △ da matriz: exige aprovação por PIN do manager, auditada. */
  approval?: true;
  /** Só sobre o que é do próprio ator (ex.: cashier fecha só o caixa dele). */
  selfOnly?: true;
  /** Só sobre papéis abaixo do seu (ex.: manager convida cashier, não owner). */
  subordinatesOnly?: true;
}

type Grant = Permission | ({ permission: Permission } & GrantMeta);

/**
 * A matriz da §5-C.5, papel por papel. Mudança aqui é mudança de contrato de
 * produto — os testes cravam os pontos sensíveis da matriz.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Grant[]> = {
  // ─── Internos Molho ─────────────────────────────────────────────────────────
  platform_owner: [
    'platform.tenant.provision',
    'platform.module.toggle',
    'platform.billing.manage',
    'platform.flags.manage',
    'platform.impersonate.read',
    'platform.impersonate.write',
  ],
  platform_support: [
    'platform.tenant.provision',
    'platform.module.toggle',
    'platform.impersonate.read',
    'platform.impersonate.write',
  ],
  platform_finance: ['platform.billing.manage'],
  platform_engineer: ['platform.flags.manage'],

  // ─── Lojista ────────────────────────────────────────────────────────────────
  owner: [
    'catalog.category.create',
    'catalog.category.update',
    'catalog.category.delete',
    'catalog.product.create',
    'catalog.product.update',
    'catalog.product.delete',
    'catalog.product.mark_unavailable',
    'catalog.import',
    'order.create',
    'order.update_status',
    'order.manual_discount',
    'order.cancel_paid',
    'payment.confirm',
    'payment.refund',
    'cash.open_close',
    'cash.withdraw',
    'delivery.dispatch',
    'delivery.update_status',
    'report.revenue.view',
    'report.margin.view',
    'invoice.issue',
    'growth.manage',
    'campaign.send',
    'customer.export',
    'team.manage',
    'module.toggle',
    'billing.manage',
  ],
  manager: [
    'catalog.category.create',
    'catalog.category.update',
    'catalog.category.delete',
    'catalog.product.create',
    'catalog.product.update',
    'catalog.product.delete',
    'catalog.product.mark_unavailable',
    'catalog.import',
    'order.create',
    'order.update_status',
    'order.manual_discount',
    'order.cancel_paid',
    'payment.confirm',
    { permission: 'payment.refund', approval: true },
    'cash.open_close',
    'cash.withdraw',
    'delivery.dispatch',
    'delivery.update_status',
    'report.revenue.view',
    'invoice.issue',
    'growth.manage',
    { permission: 'team.manage', subordinatesOnly: true },
  ],
  cashier: [
    'catalog.product.mark_unavailable',
    'order.create',
    'order.update_status',
    'payment.confirm',
    { permission: 'order.manual_discount', approval: true },
    { permission: 'order.cancel_paid', approval: true },
    { permission: 'cash.open_close', selfOnly: true },
    { permission: 'cash.withdraw', approval: true },
    'delivery.dispatch',
    'invoice.issue',
  ],
  waiter: ['order.create', 'order.update_status'],
  kitchen: ['order.update_status'],
  // Entregador NÃO acessa o backoffice: só muda status da própria entrega.
  courier: ['delivery.update_status'],
  accountant: ['report.revenue.view', 'invoice.issue'],
  marketing: ['growth.manage', 'campaign.send', { permission: 'customer.export', approval: true }],

  // ─── Franquia ───────────────────────────────────────────────────────────────
  franchisor_owner: ['franchise.manage', 'franchise.report.view'],
  franchisor_analyst: ['franchise.report.view'],

  // ─── Cliente final ──────────────────────────────────────────────────────────
  customer: [],
};

/** Uma atribuição papel+escopo (linha de user_roles). platform tem scopeId null. */
export interface RoleAssignment {
  role: Role;
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface Actor {
  id: string;
  assignments: readonly RoleAssignment[];
}

/**
 * O escopo do RECURSO sendo acessado. O chamador preenche a cadeia inteira que
 * conhece (um request de loja sabe storeId E tenantId) — é assim que uma
 * atribuição de tenant cobre as lojas dele sem esta função consultar banco.
 */
export interface ScopeRef {
  franchiseId?: string;
  tenantId?: string;
  storeId?: string;
}

export interface CanResult {
  allowed: boolean;
  requiresApproval: boolean;
  selfOnly: boolean;
  subordinatesOnly: boolean;
}

const NEGADO: CanResult = {
  allowed: false,
  requiresApproval: false,
  selfOnly: false,
  subordinatesOnly: false,
};

function assignmentCovers(assignment: RoleAssignment, scope: ScopeRef): boolean {
  switch (assignment.scopeType) {
    case 'platform':
      return true;
    case 'franchise':
      return assignment.scopeId !== null && assignment.scopeId === scope.franchiseId;
    case 'tenant':
      return assignment.scopeId !== null && assignment.scopeId === scope.tenantId;
    case 'store':
      return assignment.scopeId !== null && assignment.scopeId === scope.storeId;
  }
}

/** Quanto menos restrições, melhor o grant — quem tem dois papéis fica com o mais permissivo. */
function restricoes(result: CanResult): number {
  return (
    (result.requiresApproval ? 1 : 0) +
    (result.selfOnly ? 1 : 0) +
    (result.subordinatesOnly ? 1 : 0)
  );
}

/**
 * A função central do RBAC. Pura: recebe ator, permissão e escopo, devolve o
 * veredito com as ressalvas (△/selfOnly) para o chamador aplicar.
 */
export function can(actor: Actor, permission: Permission, scope: ScopeRef = {}): CanResult {
  let melhor = NEGADO;

  for (const assignment of actor.assignments) {
    if (!assignmentCovers(assignment, scope)) continue;

    for (const grant of ROLE_PERMISSIONS[assignment.role]) {
      const grantPermission = typeof grant === 'string' ? grant : grant.permission;
      if (grantPermission !== permission) continue;

      const meta: GrantMeta = typeof grant === 'string' ? {} : grant;
      const candidato: CanResult = {
        allowed: true,
        requiresApproval: meta.approval === true,
        selfOnly: meta.selfOnly === true,
        subordinatesOnly: meta.subordinatesOnly === true,
      };

      if (!melhor.allowed || restricoes(candidato) < restricoes(melhor)) {
        melhor = candidato;
      }
    }
  }

  return melhor;
}
