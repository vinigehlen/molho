import { describe, expect, it } from 'vitest';
import {
  type Actor,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  type Role,
  type ScopeType,
  can,
  isPermission,
  isRole,
} from './permissions';

/** Monta um ator com uma única atribuição — o caso comum. */
function ator(role: Role, scopeType: ScopeType = 'store', scopeId = 'loja-1'): Actor {
  return { id: 'u1', assignments: [{ role, scopeType, scopeId }] };
}

const NA_LOJA_1 = { tenantId: 'tenant-1', storeId: 'loja-1' };

describe('sincronização interna', () => {
  it('toda permissão concedida em ROLE_PERMISSIONS existe em PERMISSIONS', () => {
    for (const role of ROLES) {
      for (const grant of ROLE_PERMISSIONS[role]) {
        const permission = typeof grant === 'string' ? grant : grant.permission;
        expect(isPermission(permission), `${role} concede "${permission}", que não existe`).toBe(
          true,
        );
      }
    }
  });

  it('todo papel tem entrada na matriz (nenhum esquecido)', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role], `papel "${role}" sem entrada`).toBeDefined();
    }
  });

  it('nenhum papel concede a mesma permissão duas vezes', () => {
    for (const role of ROLES) {
      const permissions = ROLE_PERMISSIONS[role].map((g) =>
        typeof g === 'string' ? g : g.permission,
      );
      expect(new Set(permissions).size, `papel "${role}" tem grant duplicado`).toBe(
        permissions.length,
      );
    }
  });
});

describe('a matriz da §5-C.5, ponto a ponto sensível', () => {
  it('owner estorna sem aprovação; manager estorna COM aprovação', () => {
    const doOwner = can(ator('owner', 'tenant', 'tenant-1'), 'payment.refund', NA_LOJA_1);
    expect(doOwner).toMatchObject({ allowed: true, requiresApproval: false });

    const doManager = can(ator('manager'), 'payment.refund', NA_LOJA_1);
    expect(doManager).toMatchObject({ allowed: true, requiresApproval: true });
  });

  it('cashier: desconto manual e cancelar pedido pago são △ (PIN do manager)', () => {
    expect(can(ator('cashier'), 'order.manual_discount', NA_LOJA_1)).toMatchObject({
      allowed: true,
      requiresApproval: true,
    });
    expect(can(ator('cashier'), 'order.cancel_paid', NA_LOJA_1)).toMatchObject({
      allowed: true,
      requiresApproval: true,
    });
    // Estorno, nem com aprovação: é — na matriz.
    expect(can(ator('cashier'), 'payment.refund', NA_LOJA_1).allowed).toBe(false);
  });

  it('payment.confirm (Épico 8): owner, manager e cashier sem aprovação — dinheiro entrando, não saindo', () => {
    for (const role of ['owner', 'manager', 'cashier'] as const) {
      expect(can(ator(role), 'payment.confirm', NA_LOJA_1)).toMatchObject({
        allowed: true,
        requiresApproval: false,
      });
    }
    for (const role of ['waiter', 'kitchen', 'courier'] as const) {
      expect(can(ator(role), 'payment.confirm', NA_LOJA_1).allowed).toBe(false);
    }
  });

  it('cashier abre e fecha SÓ o próprio caixa (selfOnly)', () => {
    expect(can(ator('cashier'), 'cash.open_close', NA_LOJA_1)).toMatchObject({
      allowed: true,
      selfOnly: true,
    });
  });

  it('waiter lança pedido mas não vê caixa nem faturamento', () => {
    expect(can(ator('waiter'), 'order.create', NA_LOJA_1).allowed).toBe(true);
    expect(can(ator('waiter'), 'cash.open_close', NA_LOJA_1).allowed).toBe(false);
    expect(can(ator('waiter'), 'report.revenue.view', NA_LOJA_1).allowed).toBe(false);
  });

  it('kitchen muda status de preparo e mais nada com valor', () => {
    expect(can(ator('kitchen'), 'order.update_status', NA_LOJA_1).allowed).toBe(true);
    expect(can(ator('kitchen'), 'order.create', NA_LOJA_1).allowed).toBe(false);
    expect(can(ator('kitchen'), 'report.revenue.view', NA_LOJA_1).allowed).toBe(false);
  });

  it('courier não tem NENHUM acesso de backoffice, só o status da entrega', () => {
    expect(can(ator('courier'), 'delivery.update_status', NA_LOJA_1).allowed).toBe(true);

    for (const permission of PERMISSIONS) {
      if (permission === 'delivery.update_status') continue;
      expect(
        can(ator('courier'), permission, NA_LOJA_1).allowed,
        `courier não deveria ter "${permission}"`,
      ).toBe(false);
    }
  });

  it('só o owner vê margem/custo — nem o manager vê', () => {
    expect(can(ator('owner', 'tenant', 'tenant-1'), 'report.margin.view', NA_LOJA_1).allowed).toBe(
      true,
    );
    expect(can(ator('manager'), 'report.margin.view', NA_LOJA_1).allowed).toBe(false);
    expect(can(ator('accountant', 'tenant', 'tenant-1'), 'report.margin.view', NA_LOJA_1).allowed).toBe(
      false,
    );
  });

  it('marketing exporta a base só com aprovação do owner (trilha LGPD)', () => {
    expect(can(ator('marketing', 'tenant', 'tenant-1'), 'customer.export', NA_LOJA_1)).toMatchObject(
      { allowed: true, requiresApproval: true },
    );
  });

  it('manager gerencia equipe só abaixo do próprio papel', () => {
    expect(can(ator('manager'), 'team.manage', NA_LOJA_1)).toMatchObject({
      allowed: true,
      subordinatesOnly: true,
    });
  });

  it('mudar plano/módulo é exclusivo do owner', () => {
    expect(can(ator('owner', 'tenant', 'tenant-1'), 'module.toggle', NA_LOJA_1).allowed).toBe(true);
    expect(can(ator('manager'), 'module.toggle', NA_LOJA_1).allowed).toBe(false);
    expect(can(ator('manager'), 'billing.manage', NA_LOJA_1).allowed).toBe(false);
  });

  it('customer não tem permissão nenhuma no backoffice', () => {
    for (const permission of PERMISSIONS) {
      expect(can(ator('customer', 'tenant', 'tenant-1'), permission, NA_LOJA_1).allowed).toBe(
        false,
      );
    }
  });
});

describe('catálogo granular (Épico 4 — categories/products/modifiers, sem combos)', () => {
  const CATALOG_PERMISSIONS = [
    'catalog.category.create',
    'catalog.category.update',
    'catalog.category.delete',
    'catalog.product.create',
    'catalog.product.update',
    'catalog.product.delete',
    'catalog.product.mark_unavailable',
    'catalog.import',
  ] as const;

  it('owner e manager têm as 8 permissões de catálogo', () => {
    for (const role of ['owner', 'manager'] as const) {
      for (const permission of CATALOG_PERMISSIONS) {
        expect(
          can(ator(role, 'tenant', 'tenant-1'), permission, NA_LOJA_1).allowed,
          `${role} deveria ter "${permission}"`,
        ).toBe(true);
      }
    }
  });

  it('cashier tem APENAS mark_unavailable — não cria, edita nem apaga catálogo', () => {
    expect(can(ator('cashier'), 'catalog.product.mark_unavailable', NA_LOJA_1).allowed).toBe(true);

    for (const permission of CATALOG_PERMISSIONS) {
      if (permission === 'catalog.product.mark_unavailable') continue;
      expect(
        can(ator('cashier'), permission, NA_LOJA_1).allowed,
        `cashier não deveria ter "${permission}"`,
      ).toBe(false);
    }
  });

  it('waiter/kitchen/courier não têm NENHUMA permissão de catálogo', () => {
    for (const role of ['waiter', 'kitchen', 'courier'] as const) {
      for (const permission of CATALOG_PERMISSIONS) {
        expect(
          can(ator(role), permission, NA_LOJA_1).allowed,
          `${role} não deveria ter "${permission}"`,
        ).toBe(false);
      }
    }
  });

  it('accountant/marketing não têm NENHUMA permissão de catálogo', () => {
    for (const role of ['accountant', 'marketing'] as const) {
      for (const permission of CATALOG_PERMISSIONS) {
        expect(
          can(ator(role, 'tenant', 'tenant-1'), permission, NA_LOJA_1).allowed,
          `${role} não deveria ter "${permission}"`,
        ).toBe(false);
      }
    }
  });

  it('nenhuma permissão nova aponta pra "combos" — Épico 4 não inclui combos (Fase 2, Épico 15)', () => {
    for (const permission of PERMISSIONS) {
      expect(permission.includes('combo')).toBe(false);
    }
  });
});

describe('impersonation (permissões do Épico 2; fluxo é do Épico 14)', () => {
  it('platform_support tem os dois níveis; finance e engineer não têm nenhum', () => {
    const support: Actor = {
      id: 'u1',
      assignments: [{ role: 'platform_support', scopeType: 'platform', scopeId: null }],
    };

    expect(can(support, 'platform.impersonate.read', NA_LOJA_1).allowed).toBe(true);
    expect(can(support, 'platform.impersonate.write', NA_LOJA_1).allowed).toBe(true);

    const finance: Actor = {
      id: 'u2',
      assignments: [{ role: 'platform_finance', scopeType: 'platform', scopeId: null }],
    };
    expect(can(finance, 'platform.impersonate.read', NA_LOJA_1).allowed).toBe(false);

    const engineer: Actor = {
      id: 'u3',
      assignments: [{ role: 'platform_engineer', scopeType: 'platform', scopeId: null }],
    };
    expect(can(engineer, 'platform.impersonate.write', NA_LOJA_1).allowed).toBe(false);
  });

  it('platform_finance não enxerga operação do lojista', () => {
    const finance: Actor = {
      id: 'u2',
      assignments: [{ role: 'platform_finance', scopeType: 'platform', scopeId: null }],
    };
    expect(can(finance, 'order.create', NA_LOJA_1).allowed).toBe(false);
    expect(can(finance, 'catalog.product.update', NA_LOJA_1).allowed).toBe(false);
  });

  it('platform_support impersonando o owner: os dois conjuntos de grant valem ao mesmo tempo', () => {
    // Impersonation (Épico 14) não troca o ator — soma uma atribuição de
    // owner no tenant à atribuição de platform_support que ele já tinha. Os
    // dois precisam valer: o grant de plataforma (para poder encerrar a
    // impersonation) e o grant de owner (para operar como o lojista).
    const suporteImpersonandoOwner: Actor = {
      id: 'u1',
      assignments: [
        { role: 'platform_support', scopeType: 'platform', scopeId: null },
        { role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' },
      ],
    };

    expect(can(suporteImpersonandoOwner, 'platform.impersonate.write', NA_LOJA_1).allowed).toBe(
      true,
    );
    expect(
      can(suporteImpersonandoOwner, 'catalog.product.update', NA_LOJA_1),
    ).toMatchObject({ allowed: true, requiresApproval: false });
    expect(can(suporteImpersonandoOwner, 'payment.refund', NA_LOJA_1)).toMatchObject({
      allowed: true,
      requiresApproval: false,
    });
  });
});

describe('escopo', () => {
  it('manager da loja 1 não manda na loja 2', () => {
    const manager = ator('manager', 'store', 'loja-1');

    expect(can(manager, 'catalog.product.update', { tenantId: 'tenant-1', storeId: 'loja-1' }).allowed).toBe(
      true,
    );
    expect(can(manager, 'catalog.product.update', { tenantId: 'tenant-1', storeId: 'loja-2' }).allowed).toBe(
      false,
    );
  });

  it('atribuição de tenant cobre qualquer loja daquele tenant', () => {
    const owner = ator('owner', 'tenant', 'tenant-1');

    expect(can(owner, 'catalog.product.update', { tenantId: 'tenant-1', storeId: 'loja-1' }).allowed).toBe(
      true,
    );
    expect(can(owner, 'catalog.product.update', { tenantId: 'tenant-1', storeId: 'loja-99' }).allowed).toBe(
      true,
    );
    expect(can(owner, 'catalog.product.update', { tenantId: 'tenant-2', storeId: 'loja-1' }).allowed).toBe(
      false,
    );
  });

  it('quem tem dois papéis fica com o grant mais permissivo', () => {
    // Gerente da loja 1 que também é cashier em outra: na loja 1, o desconto
    // não pede aprovação (vence o grant do manager).
    const duplo: Actor = {
      id: 'u1',
      assignments: [
        { role: 'cashier', scopeType: 'store', scopeId: 'loja-1' },
        { role: 'manager', scopeType: 'store', scopeId: 'loja-1' },
      ],
    };

    expect(can(duplo, 'order.manual_discount', NA_LOJA_1)).toMatchObject({
      allowed: true,
      requiresApproval: false,
    });
  });

  it('franquia: analyst vê consolidado da SUA franquia, e nada de operação', () => {
    const analyst: Actor = {
      id: 'u1',
      assignments: [{ role: 'franchisor_analyst', scopeType: 'franchise', scopeId: 'fr-1' }],
    };

    expect(can(analyst, 'franchise.report.view', { franchiseId: 'fr-1' }).allowed).toBe(true);
    expect(can(analyst, 'franchise.report.view', { franchiseId: 'fr-2' }).allowed).toBe(false);
    expect(can(analyst, 'order.create', { franchiseId: 'fr-1', ...NA_LOJA_1 }).allowed).toBe(false);
  });

  it('sem escopo informado, atribuição de loja não vale (fail-closed)', () => {
    expect(can(ator('manager'), 'catalog.product.update').allowed).toBe(false);
    expect(can(ator('manager'), 'catalog.product.update', {}).allowed).toBe(false);
  });
});

describe('guardas de tipo', () => {
  it('isRole e isPermission recusam valores inventados', () => {
    expect(isRole('owner')).toBe(true);
    expect(isRole('super_hacker')).toBe(false);
    expect(isPermission('payment.refund')).toBe(true);
    expect(isPermission('payment.steal')).toBe(false);
  });
});
