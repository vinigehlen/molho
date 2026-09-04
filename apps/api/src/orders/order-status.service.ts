import { MissingCancelReasonError, OrderConflictError, OrderNotFoundError, IllegalOrderTransitionError, PaymentNotConfirmedError } from './order-errors';
import { isLegalOrderTransition, orderTransitionRequiresReason, transitionRequiresConfirmedPayment, type OrderStatus } from './order-status-machine';
import type { LoyaltyCreditor } from './loyalty-creditor.port';
import type { OrderStatusRepository } from './order-status.repository';

/** No-op — usado onde a transição não precisa saber de cashback (ex.: sem tenant com o módulo). */
export const NOOP_LOYALTY_CREDITOR: LoyaltyCreditor = {
  async creditForCompletedOrder() {
    // nada
  },
  async refundUsedBalance() {
    // nada
  },
};

/** `toStatus` que encerram o pedido SEM completá-lo — devolve saldo usado (16.2). `delivery_failed` fica de fora: o pedido foi preparado/saiu pra entrega, não é "nunca aconteceu". */
const CANCEL_FAMILY_STATUSES: ReadonlySet<OrderStatus> = new Set(['canceled', 'auto_canceled', 'expired']);

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
  /** Chave da fila offline (Épico 9): replay com a MESMA chave já aplicada não re-aplica, devolve sucesso. Ausente em ação online direta. */
  idempotencyKey?: string | null;
}

export interface RecordOrderCreationInput {
  orderId: string;
  tenantId: string;
  customerId: string;
}

export class OrderStatusService {
  constructor(
    private readonly repo: OrderStatusRepository,
    /** Épico 16b — cashback só existe se o chamador injetar a implementação real; sem isto, no-op. */
    private readonly loyalty: LoyaltyCreditor = NOOP_LOYALTY_CREDITOR,
  ) {}

  /**
   * Ponto de entrada ÚNICO pra mudar o status de um pedido já existente
   * (CLAUDE.md regra 15) — valida a transição, aplica com lock otimista,
   * grava `order_status_history` sempre e `audit_log` só quando o ator é
   * staff (cliente/sistema não são atores de RBAC/compliance, regra 3).
   */
  async transition(input: TransitionOrderStatusInput): Promise<void> {
    // Pré-check de idempotência ANTES de tudo (Épico 9): um retry cuja resposta
    // se perdeu carrega a MESMA chave; se o intent já virou linha de history,
    // devolve sucesso sem re-aplicar — sem isto, o retry veria o status já
    // mudado e morreria como IllegalOrderTransitionError (409 fantasma).
    // Cobre o replay-após-conclusão (caso comum: resposta perdida, ou 2ª aba).
    // Concorrência exata no mesmo instante: um vence, o outro pega ConflictError
    // e o cliente resolve no re-fetch (status já é o alvo) — ver desenho.
    if (input.idempotencyKey && (await this.repo.wasIdempotencyKeyApplied(input.orderId, input.idempotencyKey))) {
      return;
    }

    const order = await this.repo.findForTransition(input.orderId);
    if (!order) throw new OrderNotFoundError();

    // Congelado ANTES de applyStatusChange: um repositório poderia devolver
    // (ou, como o fake de teste, mutar) o mesmo objeto que ele próprio
    // atualiza — ler order.status depois da escrita já pegaria o valor NOVO.
    const fromStatus = order.status;
    if (orderTransitionRequiresReason(fromStatus, input.toStatus) && !input.reason?.trim()) {
      throw new MissingCancelReasonError();
    }
    if (!isLegalOrderTransition(fromStatus, input.toStatus)) {
      throw new IllegalOrderTransitionError(fromStatus, input.toStatus);
    }

    // Gate de pagamento (docs/02 §5.5) — a transição já é legal, mas pré-pago
    // (pix) não entra em `preparing` e pós-pago não chega em `completed` sem
    // `paymentStatus = 'confirmado'`. Depois da checagem estrutural: um
    // `received → completed` (ilegal) tem que morrer como transição ilegal,
    // não como pagamento não confirmado.
    if (transitionRequiresConfirmedPayment(input.toStatus, order.paymentMethod) && order.paymentStatus !== 'confirmado') {
      throw new PaymentNotConfirmedError();
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
      idempotencyKey: input.idempotencyKey ?? null,
    });

    if (input.actor.type === 'staff') {
      await this.repo.recordAuditLog({
        tenantId: order.tenantId,
        actorId: input.actor.userId,
        actorRole: input.actor.role,
        fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
      });
    }

    // Épico 16b — cashback só se credita quando o pedido de fato CONCLUI
    // (regra travada desde o doc original: "pontos só em completed"). Mesma
    // transação do resto desta função — se o crédito falhar, a transição
    // inteira reverte junto (nunca um "completou mas não creditou" silencioso).
    if (input.toStatus === 'completed') {
      await this.loyalty.creditForCompletedOrder({
        tenantId: order.tenantId,
        customerId: order.customerId,
        orderId: order.id,
        totalCents: order.totalCents,
      });
    }

    // Épico 16.2 — pedido que usou saldo de cashback e cancela ANTES de
    // concluir devolve o que foi debitado. Mesma transação do resto: se a
    // devolução falhar, o cancelamento inteiro reverte junto (nunca um
    // "cancelou mas não devolveu" silencioso, mesmo racional do crédito acima).
    if (CANCEL_FAMILY_STATUSES.has(input.toStatus) && order.cashbackUsedCents > 0) {
      await this.loyalty.refundUsedBalance({
        tenantId: order.tenantId,
        customerId: order.customerId,
        orderId: order.id,
        cashbackUsedCents: order.cashbackUsedCents,
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
