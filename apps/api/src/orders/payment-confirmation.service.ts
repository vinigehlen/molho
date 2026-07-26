import { OrderConflictError, OrderNotFoundError, PaymentAlreadyConfirmedError } from './order-errors';
import type { PaymentConfirmationRepository } from './payment-confirmation.repository';

export interface ConfirmPaymentInput {
  orderId: string;
  expectedVersion: number;
  actor: { userId: string; role: string };
}

/**
 * Reconciliação manual do PIX estático (Épico 8): o lojista confere o app do
 * banco e marca "pago" — não existe webhook nem PSP verificando nada. Ponto
 * de entrada ÚNICO pra essa transição de `paymentStatus`, mesmo espírito da
 * regra 15 (CLAUDE.md) pro `status`, ainda que seja campo diferente (ver
 * PrismaPaymentConfirmationRepository pro porquê de não reusar
 * OrderStatusService/order_status_history).
 */
export class PaymentConfirmationService {
  constructor(private readonly repo: PaymentConfirmationRepository) {}

  async confirmPayment(input: ConfirmPaymentInput): Promise<void> {
    const order = await this.repo.findForConfirmation(input.orderId);
    if (!order) throw new OrderNotFoundError();
    if (order.paymentStatus === 'confirmado') throw new PaymentAlreadyConfirmedError();

    const applied = await this.repo.applyConfirmation(input.orderId, input.expectedVersion);
    if (!applied) {
      // Reconsulta pra distinguir "sumiu"/"outra requisição já confirmou" de "versão desatualizada".
      const stillExists = await this.repo.findForConfirmation(input.orderId);
      if (!stillExists) throw new OrderNotFoundError();
      if (stillExists.paymentStatus === 'confirmado') throw new PaymentAlreadyConfirmedError();
      throw new OrderConflictError();
    }

    await this.repo.recordAuditLog({
      tenantId: order.tenantId,
      actorId: input.actor.userId,
      actorRole: input.actor.role,
      orderId: order.id,
    });
  }
}
