import { describe, expect, it } from 'vitest';
import { OrderConflictError, OrderNotFoundError, PaymentAlreadyConfirmedError } from './order-errors';
import type {
  OrderForPaymentConfirmation,
  PaymentConfirmationRepository,
  RecordPaymentAuditParams,
} from './payment-confirmation.repository';
import { PaymentConfirmationService } from './payment-confirmation.service';

class FakePaymentConfirmationRepository implements PaymentConfirmationRepository {
  rows = new Map<string, OrderForPaymentConfirmation>();
  auditLogs: RecordPaymentAuditParams[] = [];
  /** Simula escrita concorrente entre findForConfirmation() e applyConfirmation() no mesmo teste. */
  mutateBeforeApply: ((row: OrderForPaymentConfirmation) => void) | null = null;

  seed(row: OrderForPaymentConfirmation) {
    this.rows.set(row.id, row);
  }

  async findForConfirmation(orderId: string) {
    return this.rows.get(orderId) ?? null;
  }

  async applyConfirmation(orderId: string, expectedVersion: number) {
    const row = this.rows.get(orderId);
    if (!row) return false;
    if (this.mutateBeforeApply) {
      const fn = this.mutateBeforeApply;
      this.mutateBeforeApply = null;
      fn(row);
    }
    if (row.version !== expectedVersion || row.paymentStatus !== 'aguardando_confirmacao') return false;
    row.paymentStatus = 'confirmado';
    row.version += 1;
    return true;
  }

  async recordAuditLog(params: RecordPaymentAuditParams) {
    this.auditLogs.push(params);
  }
}

function setup() {
  const repo = new FakePaymentConfirmationRepository();
  return { repo, service: new PaymentConfirmationService(repo) };
}

const ACTOR = { userId: 'user-1', role: 'cashier' };

describe('PaymentConfirmationService.confirmPayment', () => {
  it('1) caminho feliz: confirma, incrementa version e grava audit_log', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', paymentStatus: 'aguardando_confirmacao', version: 0 });

    await service.confirmPayment({ orderId: 'order-1', expectedVersion: 0, actor: ACTOR });

    const row = repo.rows.get('order-1')!;
    expect(row.paymentStatus).toBe('confirmado');
    expect(row.version).toBe(1);
    expect(repo.auditLogs).toEqual([{ tenantId: 'tenant-1', actorId: 'user-1', actorRole: 'cashier', orderId: 'order-1' }]);
  });

  it('2) pedido inexistente lança OrderNotFoundError', async () => {
    const { service } = setup();
    await expect(
      service.confirmPayment({ orderId: 'missing', expectedVersion: 0, actor: ACTOR }),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('3) já confirmado (checagem de entrada, antes de tocar o repositório) lança PaymentAlreadyConfirmedError', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', paymentStatus: 'confirmado', version: 3 });

    await expect(
      service.confirmPayment({ orderId: 'order-1', expectedVersion: 3, actor: ACTOR }),
    ).rejects.toThrow(PaymentAlreadyConfirmedError);
    expect(repo.auditLogs).toHaveLength(0);
  });

  it('4) já confirmado ENTRE o find e o apply (corrida) — mesma distinção, via reconsulta', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', paymentStatus: 'aguardando_confirmacao', version: 0 });
    repo.mutateBeforeApply = (row) => {
      row.paymentStatus = 'confirmado';
      row.version = 1;
    };

    await expect(
      service.confirmPayment({ orderId: 'order-1', expectedVersion: 0, actor: ACTOR }),
    ).rejects.toThrow(PaymentAlreadyConfirmedError);
  });

  it('5) version desatualizada (ainda aguardando, mas outra edição mudou a linha) lança OrderConflictError', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', paymentStatus: 'aguardando_confirmacao', version: 0 });
    repo.mutateBeforeApply = (row) => {
      row.version = 1; // ex.: outro campo do pedido mudou, version subiu, paymentStatus continua aguardando
    };

    await expect(
      service.confirmPayment({ orderId: 'order-1', expectedVersion: 0, actor: ACTOR }),
    ).rejects.toThrow(OrderConflictError);
  });
});
