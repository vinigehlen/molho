import type { PaymentMethod, PaymentStatus } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import type { OrderStatus } from './order-status-machine';

export interface OrderStatusRecord {
  id: string;
  tenantId: string;
  status: OrderStatus;
  version: number;
  /** §5.5: o gate de pagamento em transition() lê os dois — findForTransition seleciona junto. */
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}

export interface RecordHistoryParams {
  tenantId: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorId: string | null;
  actorRole: string | null;
  customerId: string | null;
  reason: string | null;
}

export interface RecordAuditLogParams {
  tenantId: string;
  actorId: string;
  actorRole: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
}

export interface OrderStatusRepository {
  findForTransition(orderId: string): Promise<OrderStatusRecord | null>;
  /** UPDATE com WHERE version = expected — devolve false se 0 linhas mudaram (conflito OU não existe mais, ver assertOptimisticUpdate). */
  applyStatusChange(
    orderId: string,
    expectedVersion: number,
    toStatus: OrderStatus,
    reason: string | null,
  ): Promise<boolean>;
  recordHistory(params: RecordHistoryParams): Promise<void>;
  /** Só chamado para ator staff (CLAUDE.md regra 15) — audit_log.actorId é NOT NULL. */
  recordAuditLog(params: RecordAuditLogParams): Promise<void>;
}

/**
 * tenant_id nunca é parâmetro externo: RLS (app_tenant_visible) já filtra
 * toda leitura pelo tenant do GUC da transação. `RequestContextService.run()`
 * abre UMA transação por request — update + history + audit_log aqui dentro
 * já caem na "transação só" exigida pela regra 15, sem `$transaction`
 * explícito nenhum neste arquivo.
 */
export class PrismaOrderStatusRepository implements OrderStatusRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findForTransition(orderId: string): Promise<OrderStatusRecord | null> {
    return this.requestContext.getClient().order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, tenantId: true, status: true, version: true, paymentMethod: true, paymentStatus: true },
    });
  }

  async applyStatusChange(
    orderId: string,
    expectedVersion: number,
    toStatus: OrderStatus,
    reason: string | null,
  ): Promise<boolean> {
    const isSadTerminal = toStatus === 'canceled' || toStatus === 'auto_canceled' || toStatus === 'delivery_failed';
    const result = await this.requestContext.getClient().order.updateMany({
      where: { id: orderId, version: expectedVersion, deletedAt: null },
      data: {
        status: toStatus,
        version: { increment: 1 },
        ...(isSadTerminal ? { canceledAt: new Date(), canceledReason: reason } : {}),
      },
    });
    return result.count > 0;
  }

  async recordHistory(params: RecordHistoryParams): Promise<void> {
    await this.requestContext.getClient().orderStatusHistory.create({
      data: {
        tenantId: params.tenantId,
        orderId: params.orderId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        actorId: params.actorId,
        actorRole: params.actorRole,
        customerId: params.customerId,
        reason: params.reason,
      },
    });
  }

  async recordAuditLog(params: RecordAuditLogParams): Promise<void> {
    await this.requestContext.getClient().auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: 'order.status_transition',
        entity: 'order',
        beforeJson: { status: params.fromStatus },
        afterJson: { status: params.toStatus },
      },
    });
  }
}
