import { describe, expect, it } from 'vitest';
import { OrderConflictError, OrderNotFoundError } from './order-errors';
import type { OrderFlagRepository, OrderForFlag, RecordFlagAuditParams } from './order-flag.repository';
import { OrderFlagService } from './order-flag.service';

class FakeOrderFlagRepository implements OrderFlagRepository {
  rows = new Map<string, OrderForFlag>();
  auditLogs: RecordFlagAuditParams[] = [];
  mutateBeforeApply: ((row: OrderForFlag) => void) | null = null;

  seed(row: OrderForFlag) {
    this.rows.set(row.id, row);
  }

  async findForFlag(orderId: string) {
    const row = this.rows.get(orderId);
    return row ? { ...row } : null; // cópia — a linha real do Prisma não muda por referência quando applyFlag() escreve.
  }

  async applyFlag(orderId: string, expectedVersion: number, flagged: boolean, reason: string | null) {
    if (this.mutateBeforeApply) {
      const fn = this.mutateBeforeApply;
      this.mutateBeforeApply = null;
      const row = this.rows.get(orderId);
      if (row) fn(row);
    }
    // Re-lê depois do mutate, como um UPDATE ... WHERE re-avalia o estado atual.
    const row = this.rows.get(orderId);
    if (!row || row.version !== expectedVersion) return false;
    row.flaggedAt = flagged ? new Date('2026-08-28T18:00:00.000Z') : null;
    row.flaggedReason = flagged ? reason : null;
    row.version += 1;
    return true;
  }

  async recordAuditLog(params: RecordFlagAuditParams) {
    this.auditLogs.push(params);
  }
}

function setup() {
  const repo = new FakeOrderFlagRepository();
  return { repo, service: new OrderFlagService(repo) };
}

const ACTOR = { userId: 'user-1', role: 'cashier' };

describe('OrderFlagService.setFlag', () => {
  it('1) caminho feliz: sinaliza, incrementa version e grava audit_log', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', flaggedAt: null, flaggedReason: null, version: 0 });

    await service.setFlag({ orderId: 'order-1', expectedVersion: 0, flagged: true, reason: 'Cliente ligou', actor: ACTOR });

    const row = repo.rows.get('order-1')!;
    expect(row.flaggedAt).not.toBeNull();
    expect(row.flaggedReason).toBe('Cliente ligou');
    expect(row.version).toBe(1);
    expect(repo.auditLogs).toEqual([
      {
        tenantId: 'tenant-1',
        actorId: 'user-1',
        actorRole: 'cashier',
        orderId: 'order-1',
        flagged: true,
        reason: 'Cliente ligou',
        before: { flaggedAt: null, flaggedReason: null },
      },
    ]);
  });

  it('2) dessinalizar limpa flaggedAt/flaggedReason', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', flaggedAt: new Date(), flaggedReason: 'Motivo antigo', version: 1 });

    await service.setFlag({ orderId: 'order-1', expectedVersion: 1, flagged: false, reason: null, actor: ACTOR });

    const row = repo.rows.get('order-1')!;
    expect(row.flaggedAt).toBeNull();
    expect(row.flaggedReason).toBeNull();
  });

  it('3) pedido inexistente lança OrderNotFoundError', async () => {
    const { service } = setup();
    await expect(
      service.setFlag({ orderId: 'missing', expectedVersion: 0, flagged: true, reason: null, actor: ACTOR }),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('4) version desatualizada lança OrderConflictError', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', flaggedAt: null, flaggedReason: null, version: 0 });
    repo.mutateBeforeApply = (row) => {
      row.version = 1;
    };

    await expect(
      service.setFlag({ orderId: 'order-1', expectedVersion: 0, flagged: true, reason: null, actor: ACTOR }),
    ).rejects.toThrow(OrderConflictError);
  });

  it('5) pedido some entre find e apply (corrida) lança OrderNotFoundError', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', flaggedAt: null, flaggedReason: null, version: 0 });
    repo.mutateBeforeApply = () => {
      repo.rows.delete('order-1');
    };

    await expect(
      service.setFlag({ orderId: 'order-1', expectedVersion: 0, flagged: true, reason: null, actor: ACTOR }),
    ).rejects.toThrow(OrderNotFoundError);
  });
});
