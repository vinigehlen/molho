import { describe, expect, it } from 'vitest';
import { IllegalOrderTransitionError, MissingCancelReasonError, OrderConflictError, OrderNotFoundError } from './order-errors';
import type { OrderStatus } from './order-status-machine';
import type {
  OrderStatusRecord,
  OrderStatusRepository,
  RecordAuditLogParams,
  RecordHistoryParams,
} from './order-status.repository';
import { OrderStatusService } from './order-status.service';

class FakeOrderStatusRepository implements OrderStatusRepository {
  rows = new Map<string, OrderStatusRecord>();
  history: RecordHistoryParams[] = [];
  auditLogs: RecordAuditLogParams[] = [];
  /** Simula uma escrita concorrente entre findForTransition() e applyStatusChange() no mesmo teste. */
  mutateBeforeApply: ((row: OrderStatusRecord) => void) | null = null;

  seed(row: OrderStatusRecord) {
    this.rows.set(row.id, row);
  }

  async findForTransition(orderId: string) {
    return this.rows.get(orderId) ?? null;
  }

  async applyStatusChange(orderId: string, expectedVersion: number, toStatus: OrderStatus) {
    const row = this.rows.get(orderId);
    if (!row) return false;
    if (this.mutateBeforeApply) {
      const fn = this.mutateBeforeApply;
      this.mutateBeforeApply = null;
      fn(row);
    }
    if (row.version !== expectedVersion) return false;
    row.status = toStatus;
    row.version += 1;
    return true;
  }

  async recordHistory(params: RecordHistoryParams) {
    this.history.push(params);
  }

  async recordAuditLog(params: RecordAuditLogParams) {
    this.auditLogs.push(params);
  }
}

function setup() {
  const repo = new FakeOrderStatusRepository();
  return { repo, service: new OrderStatusService(repo) };
}

const STAFF = { type: 'staff' as const, userId: 'user-1', role: 'manager' };
const CUSTOMER = { type: 'customer' as const, customerId: 'customer-1' };

describe('OrderStatusService.transition', () => {
  it('1) transição legal aplica status, incrementa version e grava order_status_history', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', status: 'received', version: 0 });

    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null });

    const row = repo.rows.get('order-1')!;
    expect(row.status).toBe('preparing');
    expect(row.version).toBe(1);
    expect(repo.history).toHaveLength(1);
    expect(repo.history[0]).toMatchObject({ fromStatus: 'received', toStatus: 'preparing', actorId: 'user-1', customerId: null });
  });

  it('2) ator staff grava audit_log; ator customer/system não grava', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', status: 'received', version: 0 });
    repo.seed({ id: 'order-2', tenantId: 'tenant-1', status: 'received', version: 0 });

    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null });
    expect(repo.auditLogs).toHaveLength(1);

    await service.transition({ orderId: 'order-2', expectedVersion: 0, toStatus: 'canceled', actor: CUSTOMER, reason: 'Mudei de ideia' });
    expect(repo.auditLogs).toHaveLength(1);
    expect(repo.history[1]).toMatchObject({ customerId: 'customer-1', actorId: null });
  });

  it('3) transição ilegal lança IllegalOrderTransitionError e não grava nada', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', status: 'ready', version: 0 });

    await expect(
      service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'canceled', actor: STAFF, reason: 'x' }),
    ).rejects.toThrow(IllegalOrderTransitionError);
    expect(repo.history).toHaveLength(0);
    expect(repo.rows.get('order-1')!.status).toBe('ready');
  });

  it('4) pedido inexistente lança OrderNotFoundError', async () => {
    const { service } = setup();
    await expect(
      service.transition({ orderId: 'missing', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null }),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('5) canceled sem reason lança MissingCancelReasonError antes de tocar o repositório', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', status: 'received', version: 0 });

    await expect(
      service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'canceled', actor: STAFF, reason: '   ' }),
    ).rejects.toThrow(MissingCancelReasonError);
    expect(repo.history).toHaveLength(0);
  });

  it('6) delivery_failed sem reason também lança MissingCancelReasonError', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', status: 'in_transit', version: 0 });

    await expect(
      service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'delivery_failed', actor: STAFF, reason: null }),
    ).rejects.toThrow(MissingCancelReasonError);
  });

  it('7) version desatualizada (escrita concorrente) lança OrderConflictError, não NotFoundError', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', status: 'received', version: 0 });
    repo.mutateBeforeApply = (row) => {
      row.version = 1;
    };

    await expect(
      service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null }),
    ).rejects.toThrow(OrderConflictError);
  });

  it('8) canceled com reason preenchido aplica normalmente', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', tenantId: 'tenant-1', status: 'received', version: 0 });

    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'canceled', actor: STAFF, reason: 'Item em falta' });

    expect(repo.rows.get('order-1')!.status).toBe('canceled');
    expect(repo.history[0]!.reason).toBe('Item em falta');
  });
});

describe('OrderStatusService.recordCreation', () => {
  it('9) grava a primeira linha de order_status_history com fromStatus null e ator cliente', async () => {
    const { repo, service } = setup();

    await service.recordCreation({ orderId: 'order-1', tenantId: 'tenant-1', customerId: 'customer-1' });

    expect(repo.history).toHaveLength(1);
    expect(repo.history[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'received',
      actorId: null,
      actorRole: null,
      customerId: 'customer-1',
    });
    expect(repo.auditLogs).toHaveLength(0);
  });
});
