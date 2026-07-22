import { MissingCancelReasonError, OrderConflictError, OrderNotFoundError, IllegalOrderTransitionError } from './order-errors';
import { isLegalOrderTransition, orderTransitionRequiresReason, type OrderStatus } from './order-status-machine';
import type { OrderStatusRepository } from './order-status.repository';

/**
 * Nunca `{type:'staff', actorId: string | null}` — a união força quem chama
 * a decidir explicitamente qual das duas semânticas de identidade
 * (CLAUDE.md regra 3) está transicionando, sem estado inválido representável
 * (staff E customer preenchidos, ou nenhum dos dois com o tipo errado).
 */
export type OrderTransitionActor =
  | { type: 'staff'; userId: string; role: string }
  | { type: 'customer'; customerId: string }
  | { type: 'system' };

export interface TransitionOrderStatusInput {
  orderId: string;
  expectedVersion: number;
  toStatus: OrderStatus;
  actor: OrderTransitionActor;
  reason: string | null;
}

export interface RecordOrderCreationInput {
  orderId: string;
  tenantId: string;
  customerId: string;
}

export class OrderStatusService {
  constructor(private readonly repo: OrderStatusRepository) {}

  /**
   * Ponto de entrada ÚNICO pra mudar o status de um pedido já existente
   * (CLAUDE.md regra 15) — valida a transição, aplica com lock otimista,
   * grava `order_status_history` sempre e `audit_log` só quando o ator é
   * staff (cliente/sistema não são atores de RBAC/compliance, regra 3).
   */
  async transition(input: TransitionOrderStatusInput): Promise<void> {
    if (orderTransitionRequiresReason(input.toStatus) && !input.reason?.trim()) {
      throw new MissingCancelReasonError();
    }

    const order = await this.repo.findForTransition(input.orderId);
    if (!order) throw new OrderNotFoundError();

    // Congelado ANTES de applyStatusChange: um repositório poderia devolver
    // (ou, como o fake de teste, mutar) o mesmo objeto que ele próprio
    // atualiza — ler order.status depois da escrita já pegaria o valor NOVO.
    const fromStatus = order.status;
    if (!isLegalOrderTransition(fromStatus, input.toStatus)) {
      throw new IllegalOrderTransitionError(fromStatus, input.toStatus);
    }

    const applied = await this.repo.applyStatusChange(input.orderId, input.expectedVersion, input.toStatus, input.reason);
    if (!applied) {
      const stillExists = await this.repo.findForTransition(input.orderId);
      throw stillExists ? new OrderConflictError() : new OrderNotFoundError();
    }

    await this.repo.recordHistory({
      tenantId: order.tenantId,
      orderId: order.id,
      fromStatus,
      toStatus: input.toStatus,
      actorId: input.actor.type === 'staff' ? input.actor.userId : null,
      actorRole: input.actor.type === 'staff' ? input.actor.role : null,
      customerId: input.actor.type === 'customer' ? input.actor.customerId : null,
      reason: input.reason,
    });

    if (input.actor.type === 'staff') {
      await this.repo.recordAuditLog({
        tenantId: order.tenantId,
        actorId: input.actor.userId,
        actorRole: input.actor.role,
        fromStatus,
        toStatus: input.toStatus,
      });
    }
  }

  /**
   * Primeira linha de `order_status_history` (fromStatus null) — separada de
   * `transition()` porque não existe pedido "antes" pra buscar/validar
   * versão: o checkout já cria a linha em `orders` direto como `received`
   * (PIX estático, regra 5). Sempre ator cliente — nunca chega staff aqui.
   */
  async recordCreation(input: RecordOrderCreationInput): Promise<void> {
    await this.repo.recordHistory({
      tenantId: input.tenantId,
      orderId: input.orderId,
      fromStatus: null,
      toStatus: 'received',
      actorId: null,
      actorRole: null,
      customerId: input.customerId,
      reason: null,
    });
  }
}
