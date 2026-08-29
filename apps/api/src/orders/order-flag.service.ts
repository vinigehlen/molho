import { OrderConflictError, OrderNotFoundError } from './order-errors';
import type { OrderFlagRepository } from './order-flag.repository';

export interface SetOrderFlagInput {
  orderId: string;
  expectedVersion: number;
  flagged: boolean;
  reason: string | null;
  actor: { userId: string; role: string };
}

/**
 * Ponto de entrada ÚNICO pra sinalizar/dessinalizar um pedido (Fase 3, plano
 * do gestor). Espelha PaymentConfirmationService: 1 campo, lock otimista,
 * audit_log — sem passar pela máquina de estados de `status`.
 */
export class OrderFlagService {
  constructor(private readonly repo: OrderFlagRepository) {}

  async setFlag(input: SetOrderFlagInput): Promise<void> {
    const order = await this.repo.findForFlag(input.orderId);
    if (!order) throw new OrderNotFoundError();

    const applied = await this.repo.applyFlag(input.orderId, input.expectedVersion, input.flagged, input.reason);
    if (!applied) {
      const stillExists = await this.repo.findForFlag(input.orderId);
      if (!stillExists) throw new OrderNotFoundError();
      throw new OrderConflictError();
    }

    await this.repo.recordAuditLog({
      tenantId: order.tenantId,
      actorId: input.actor.userId,
      actorRole: input.actor.role,
      orderId: order.id,
      flagged: input.flagged,
      reason: input.reason,
      before: { flaggedAt: order.flaggedAt, flaggedReason: order.flaggedReason },
    });
  }
}
