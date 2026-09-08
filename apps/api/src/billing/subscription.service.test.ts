import { describe, expect, it } from 'vitest';
import type { SubscriptionStatus } from '@molho/contracts';
import type { SubscriptionTransition } from './subscription-lifecycle';
import { SubscriptionAlreadyCanceledError, SubscriptionCanceledError, TenantNotFoundError } from './subscription.errors';
import type { SubscriptionRepository, TenantSubscriptionRecord } from './subscription.repository';
import { SubscriptionService } from './subscription.service';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTOR = { id: 'admin-1', role: 'platform.superadmin' };

function record(overrides: Partial<TenantSubscriptionRecord> = {}): TenantSubscriptionRecord {
  return {
    id: 'tenant-1',
    planId: 'standard',
    status: 'trial',
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    pastDueAt: null,
    canceledAt: null,
    ...overrides,
  };
}

class FakeSubscriptionRepository implements SubscriptionRepository {
  rows = new Map<string, TenantSubscriptionRecord>();
  automaticTransitionCalls: { tenantId: string; fromStatus: SubscriptionStatus; transition: SubscriptionTransition }[] = [];
  /** Simula outra request lazy vencendo a corrida — a nossa applyAutomaticTransition sempre falha uma vez. */
  loseRaceOnce = false;

  async findTenant(tenantId: string) {
    return this.rows.get(tenantId) ?? null;
  }

  async applyAutomaticTransition(tenantId: string, fromStatus: SubscriptionStatus, transition: SubscriptionTransition) {
    this.automaticTransitionCalls.push({ tenantId, fromStatus, transition });
    if (this.loseRaceOnce) {
      this.loseRaceOnce = false;
      return false;
    }
    const row = this.rows.get(tenantId);
    if (!row || row.status !== fromStatus) return false;
    this.rows.set(tenantId, { ...row, status: transition.toStatus, ...transition.patch });
    return true;
  }

  async markPaid(tenantId: string, periodEndsAt: Date) {
    const row = this.rows.get(tenantId);
    if (!row) throw new TenantNotFoundError();
    const updated = { ...row, status: 'active' as const, currentPeriodEndsAt: periodEndsAt, trialEndsAt: null, pastDueAt: null };
    this.rows.set(tenantId, updated);
    return updated;
  }

  async cancel(tenantId: string) {
    const row = this.rows.get(tenantId);
    if (!row) throw new TenantNotFoundError();
    const updated = { ...row, status: 'canceled' as const, canceledAt: NOW };
    this.rows.set(tenantId, updated);
    return updated;
  }
}

function setup() {
  const repo = new FakeSubscriptionRepository();
  const service = new SubscriptionService(repo, () => NOW);
  return { repo, service };
}

describe('SubscriptionService.currentStatus', () => {
  it('sem transição pendente: devolve o estado gravado, sem tocar applyAutomaticTransition', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'trial', trialEndsAt: new Date(NOW.getTime() + DAY_MS) }));

    const result = await service.currentStatus('tenant-1');

    expect(result.status).toBe('trial');
    expect(repo.automaticTransitionCalls).toHaveLength(0);
  });

  it('transição pendente: aplica e devolve o estado JÁ NOVO, nunca o obsoleto', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'trial', trialEndsAt: new Date(NOW.getTime() - 1) }));

    const result = await service.currentStatus('tenant-1');

    expect(result.status).toBe('suspended');
    expect(repo.automaticTransitionCalls).toEqual([
      { tenantId: 'tenant-1', fromStatus: 'trial', transition: { toStatus: 'suspended', patch: {} } },
    ]);
  });

  it('perde a corrida da transição automática: relê o banco e devolve o estado REAL, não assume a própria versão', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'active', currentPeriodEndsAt: new Date(NOW.getTime() - 1) }));
    repo.loseRaceOnce = true;
    // Enquanto perdemos a corrida, outra request já tinha aplicado E o
    // tenant já virou suspended (avançou mais do que a nossa própria
    // transição teria feito) — prova que relemos de verdade, não corrigimos
    // localmente.
    repo.rows.set('tenant-1', { ...repo.rows.get('tenant-1')!, status: 'suspended' });

    const result = await service.currentStatus('tenant-1');

    expect(result.status).toBe('suspended');
  });

  it('tenant inexistente: TenantNotFoundError', async () => {
    const { service } = setup();
    await expect(service.currentStatus('sumiu')).rejects.toBeInstanceOf(TenantNotFoundError);
  });
});

describe('SubscriptionService.isAccessBlocked', () => {
  it('trial ativo: false', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'trial', trialEndsAt: new Date(NOW.getTime() + DAY_MS) }));
    await expect(service.isAccessBlocked('tenant-1')).resolves.toBe(false);
  });

  it('suspended: true', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'suspended' }));
    await expect(service.isAccessBlocked('tenant-1')).resolves.toBe(true);
  });

  it('trial que expirou NESTA leitura (lazy transition) já bloqueia na mesma chamada', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'trial', trialEndsAt: new Date(NOW.getTime() - 1) }));
    await expect(service.isAccessBlocked('tenant-1')).resolves.toBe(true);
  });
});

describe('SubscriptionService.markPaid', () => {
  it('reabre suspended pra active, zera trialEndsAt e pastDueAt, seta o novo período', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'suspended', trialEndsAt: new Date(0), pastDueAt: new Date(0) }));

    const result = await service.markPaid('tenant-1', 30, ACTOR);

    expect(result.status).toBe('active');
    expect(result.trialEndsAt).toBeNull();
    expect(result.pastDueAt).toBeNull();
    expect(result.currentPeriodEndsAt).toEqual(new Date(NOW.getTime() + 30 * DAY_MS));
  });

  it('assinatura cancelada: SubscriptionCanceledError, nunca reabre', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'canceled' }));

    await expect(service.markPaid('tenant-1', 30, ACTOR)).rejects.toBeInstanceOf(SubscriptionCanceledError);
  });

  it('tenant inexistente: TenantNotFoundError', async () => {
    const { service } = setup();
    await expect(service.markPaid('sumiu', 30, ACTOR)).rejects.toBeInstanceOf(TenantNotFoundError);
  });
});

describe('SubscriptionService.cancel', () => {
  it('cancela a partir de qualquer estado não-cancelado', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'active' }));

    const result = await service.cancel('tenant-1', ACTOR);

    expect(result.status).toBe('canceled');
  });

  it('já cancelada: SubscriptionAlreadyCanceledError, nunca um no-op silencioso', async () => {
    const { repo, service } = setup();
    repo.rows.set('tenant-1', record({ status: 'canceled' }));

    await expect(service.cancel('tenant-1', ACTOR)).rejects.toBeInstanceOf(SubscriptionAlreadyCanceledError);
  });
});
