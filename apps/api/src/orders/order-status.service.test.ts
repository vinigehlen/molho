import { describe, expect, it } from 'vitest';
import { IllegalOrderTransitionError, MissingCancelReasonError, OrderConflictError, OrderNotFoundError, PaymentNotConfirmedError } from './order-errors';
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

  /** Default = PIX já pago: passa o gate de preparo (§5.5), então os testes de
   *  máquina de estados não precisam se preocupar com pagamento. Testes de gate
   *  passam paymentMethod/paymentStatus explícitos. */
  seed(row: Pick<OrderStatusRecord, 'id' | 'status' | 'version'> & Partial<OrderStatusRecord>) {
    this.rows.set(row.id, { tenantId: 'tenant-1', paymentMethod: 'pix', paymentStatus: 'confirmado', ...row });
  }

  async findForTransition(orderId: string) {
    return this.rows.get(orderId) ?? null;
  }

  async wasIdempotencyKeyApplied(orderId: string, idempotencyKey: string) {
    return this.history.some((h) => h.orderId === orderId && h.idempotencyKey === idempotencyKey);
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

describe('OrderStatusService.transition — gate de pagamento (§5.5)', () => {
  it('10) pix não confirmado bloqueia received → preparing (PaymentNotConfirmedError), não grava nada', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'received', version: 0, paymentMethod: 'pix', paymentStatus: 'aguardando_confirmacao' });

    await expect(
      service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null }),
    ).rejects.toThrow(PaymentNotConfirmedError);
    expect(repo.history).toHaveLength(0);
    expect(repo.rows.get('order-1')!.status).toBe('received');
  });

  it('11) pix confirmado libera received → preparing', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'received', version: 0, paymentMethod: 'pix', paymentStatus: 'confirmado' });

    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null });
    expect(repo.rows.get('order-1')!.status).toBe('preparing');
  });

  it('12) pós-pago (cash) NÃO bloqueia preparing mesmo sem confirmar — pagam na entrega', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'received', version: 0, paymentMethod: 'cash_on_delivery', paymentStatus: 'aguardando_confirmacao' });

    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null });
    expect(repo.rows.get('order-1')!.status).toBe('preparing');
  });

  it('13) pós-pago (card) não confirmado bloqueia in_transit → completed (fecha o dado morto)', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'in_transit', version: 0, paymentMethod: 'card_on_delivery', paymentStatus: 'aguardando_confirmacao' });

    await expect(
      service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'completed', actor: STAFF, reason: null }),
    ).rejects.toThrow(PaymentNotConfirmedError);
    expect(repo.rows.get('order-1')!.status).toBe('in_transit');
  });

  it('14) pós-pago (cash) confirmado libera in_transit → completed', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'in_transit', version: 0, paymentMethod: 'cash_on_delivery', paymentStatus: 'confirmado' });

    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'completed', actor: STAFF, reason: null });
    expect(repo.rows.get('order-1')!.status).toBe('completed');
  });

  it('15) pix NÃO é gateado em completed (já foi barrado antes, em preparing) — libera mesmo aguardando', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'in_transit', version: 0, paymentMethod: 'pix', paymentStatus: 'aguardando_confirmacao' });

    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'completed', actor: STAFF, reason: null });
    expect(repo.rows.get('order-1')!.status).toBe('completed');
  });
});

describe('OrderStatusService.transition — idempotência da fila offline (§9)', () => {
  it('16) replay com a MESMA chave já aplicada devolve sucesso SEM re-aplicar (não muda version, não dobra history)', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'received', version: 0 });

    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null, idempotencyKey: 'k1' });
    expect(repo.rows.get('order-1')!.status).toBe('preparing');
    expect(repo.rows.get('order-1')!.version).toBe(1);
    expect(repo.history).toHaveLength(1);

    // Retry (resposta perdida) com a MESMA chave — o pedido já está em preparing.
    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null, idempotencyKey: 'k1' });
    expect(repo.rows.get('order-1')!.version).toBe(1); // NÃO re-aplicou
    expect(repo.history).toHaveLength(1); // NÃO dobrou o history
  });

  it('17) sem o pré-check, o retry morreria como transição ilegal — prova de que a chave é o que evita o 409 fantasma', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'received', version: 0 });
    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null, idempotencyKey: 'k1' });

    // Mesma chave, mas o status já é 'preparing' → received→preparing seria ILEGAL agora.
    // Com o pré-check, resolve como sucesso idempotente em vez de IllegalOrderTransitionError.
    await expect(
      service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null, idempotencyKey: 'k1' }),
    ).resolves.toBeUndefined();
  });

  it('18) chave NOVA (outro intent) não é deduplicada — segue o fluxo normal', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'received', version: 0 });
    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null, idempotencyKey: 'k1' });

    // chave diferente, transição legal (preparing→ready) → aplica normalmente
    await service.transition({ orderId: 'order-1', expectedVersion: 1, toStatus: 'ready', actor: STAFF, reason: null, idempotencyKey: 'k2' });
    expect(repo.rows.get('order-1')!.status).toBe('ready');
    expect(repo.history).toHaveLength(2);
  });

  it('19) a chave é gravada na linha de history', async () => {
    const { repo, service } = setup();
    repo.seed({ id: 'order-1', status: 'received', version: 0 });
    await service.transition({ orderId: 'order-1', expectedVersion: 0, toStatus: 'preparing', actor: STAFF, reason: null, idempotencyKey: 'abc' });
    expect(repo.history[0]!.idempotencyKey).toBe('abc');
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
