import type { RequestContextService } from '../context/request-context.service';

export interface OrderForFlag {
  id: string;
  tenantId: string;
  flaggedAt: Date | null;
  flaggedReason: string | null;
  version: number;
}

export interface RecordFlagAuditParams {
  tenantId: string;
  actorId: string;
  actorRole: string;
  orderId: string;
  flagged: boolean;
  reason: string | null;
  before: { flaggedAt: Date | null; flaggedReason: string | null };
}

export interface OrderFlagRepository {
  findForFlag(orderId: string): Promise<OrderForFlag | null>;
  /** UPDATE com WHERE version = expected — devolve false se 0 linhas mudaram (versão desatualizada OU sumiu). */
  applyFlag(orderId: string, expectedVersion: number, flagged: boolean, reason: string | null): Promise<boolean>;
  recordAuditLog(params: RecordFlagAuditParams): Promise<void>;
}

/**
 * Sinalização manual de pendência (Fase 3, plano do gestor) — campo próprio,
 * fora da máquina de estados (`status`), mesmo racional de `paymentStatus`
 * em PrismaPaymentConfirmationRepository: não passa por
 * `transitionOrderStatus`/`order_status_history`, `audit_log` cobre a
 * auditoria (CLAUDE.md regra 9).
 */
export class PrismaOrderFlagRepository implements OrderFlagRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findForFlag(orderId: string): Promise<OrderForFlag | null> {
    return this.requestContext.getClient().order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, tenantId: true, flaggedAt: true, flaggedReason: true, version: true },
    });
  }

  async applyFlag(orderId: string, expectedVersion: number, flagged: boolean, reason: string | null): Promise<boolean> {
    const result = await this.requestContext.getClient().order.updateMany({
      where: { id: orderId, version: expectedVersion, deletedAt: null },
      data: {
        flaggedAt: flagged ? new Date() : null,
        flaggedReason: flagged ? reason : null,
        version: { increment: 1 },
      },
    });
    return result.count > 0;
  }

  async recordAuditLog(params: RecordFlagAuditParams): Promise<void> {
    await this.requestContext.getClient().auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: params.flagged ? 'order.flag' : 'order.unflag',
        entity: 'order',
        beforeJson: { flaggedAt: params.before.flaggedAt, flaggedReason: params.before.flaggedReason },
        afterJson: { flaggedAt: params.flagged ? new Date().toISOString() : null, flaggedReason: params.flagged ? params.reason : null },
      },
    });
  }
}
