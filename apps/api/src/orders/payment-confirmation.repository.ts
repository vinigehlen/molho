import type { RequestContextService } from '../context/request-context.service';

export interface OrderForPaymentConfirmation {
  id: string;
  tenantId: string;
  paymentStatus: 'aguardando_confirmacao' | 'confirmado';
  version: number;
}

export interface RecordPaymentAuditParams {
  tenantId: string;
  actorId: string;
  actorRole: string;
  orderId: string;
}

export interface PaymentConfirmationRepository {
  findForConfirmation(orderId: string): Promise<OrderForPaymentConfirmation | null>;
  /** UPDATE com WHERE version = expected AND payment_status = 'aguardando_confirmacao' — devolve false se 0 linhas mudaram (versão desatualizada OU já confirmado OU sumiu). */
  applyConfirmation(orderId: string, expectedVersion: number): Promise<boolean>;
  recordAuditLog(params: RecordPaymentAuditParams): Promise<void>;
}

/**
 * `paymentStatus` é campo separado de `status` (OrderStatus) — não passa por
 * `transitionOrderStatus`/`order_status_history` (essa tabela é tipada pra
 * `OrderStatus`, ver comentário no schema.prisma). `audit_log` é quem cobre
 * a auditoria aqui (CLAUDE.md regra 9: toda ação sensível de dinheiro grava
 * nela), mesmo padrão de `PrismaOrderStatusRepository.recordAuditLog`.
 */
export class PrismaPaymentConfirmationRepository implements PaymentConfirmationRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findForConfirmation(orderId: string): Promise<OrderForPaymentConfirmation | null> {
    return this.requestContext.getClient().order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, tenantId: true, paymentStatus: true, version: true },
    });
  }

  async applyConfirmation(orderId: string, expectedVersion: number): Promise<boolean> {
    const result = await this.requestContext.getClient().order.updateMany({
      where: { id: orderId, version: expectedVersion, paymentStatus: 'aguardando_confirmacao', deletedAt: null },
      data: { paymentStatus: 'confirmado', version: { increment: 1 } },
    });
    return result.count > 0;
  }

  async recordAuditLog(params: RecordPaymentAuditParams): Promise<void> {
    await this.requestContext.getClient().auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: 'order.payment_confirm',
        entity: 'order',
        beforeJson: { paymentStatus: 'aguardando_confirmacao' },
        afterJson: { paymentStatus: 'confirmado' },
      },
    });
  }
}
