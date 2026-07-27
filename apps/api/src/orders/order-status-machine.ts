import type { PaymentMethod } from '@molho/contracts';

export type OrderStatus =
  | 'pending_payment'
  | 'received'
  | 'preparing'
  | 'ready'
  | 'in_transit'
  | 'completed'
  | 'expired'
  | 'auto_canceled'
  | 'canceled'
  | 'delivery_failed';

/**
 * Máquina de estados do pedido — docs/02-definicoes-v1.md §5.1/§5.2.
 *
 * `pending_payment`/`expired`/`auto_canceled` ficam mortos até o Épico 24
 * (PIX online): nenhum código de produção HOJE produz essas transições
 * (o Épico 8 é PIX ESTÁTICO — confirmação manual, sem timer nenhum), mas já
 * estão aqui pra não precisar de migration quando o Épico 24 plugar os
 * timers. `delivery_failed` é terminal no MVP (decisão do Épico 7 —
 * `returned`, destino físico da comida, é logística do restaurante, não
 * estado que o Molho rastreia).
 *
 * `ready`/`in_transit` NÃO aceitam cancelamento: docs/02 §5.2 só lista
 * cancelamento até `preparing` — depois disso, o único caminho infeliz é
 * `delivery_failed` na entrega.
 */
const LEGAL_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ['received', 'expired'],
  received: ['preparing', 'canceled', 'auto_canceled'],
  preparing: ['ready', 'canceled'],
  ready: ['in_transit'],
  in_transit: ['completed', 'delivery_failed'],
  completed: [],
  expired: [],
  auto_canceled: [],
  canceled: [],
  delivery_failed: [],
};

export function isLegalOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/**
 * Gate de pagamento por método (docs/02 §5.5) — separado de
 * isLegalOrderTransition (que é estrutural): aqui a transição já é legal, mas
 * uma regra de negócio de pagamento pode barrá-la. Retorna true se a
 * transição EXIGE `paymentStatus = 'confirmado'`.
 *
 * - `preparing`: só `pix` bloqueia — é o único PRÉ-pago; cozinha não prepara
 *   PIX não confirmado. Pós-pagos (dinheiro/cartão na entrega) NÃO bloqueiam
 *   aqui: pagam depois do preparo, bloquear travaria o pedido pra sempre.
 * - `completed`: só os PÓS-pagos bloqueiam — fecha o dado morto (pedido em
 *   dinheiro/cartão nunca sai de `aguardando_confirmacao` sozinho). `pix` fica
 *   de fora: já foi barrado na entrada de `preparing`; se chegou aqui, pagou.
 */
export function transitionRequiresConfirmedPayment(to: OrderStatus, paymentMethod: PaymentMethod): boolean {
  if (to === 'preparing') return paymentMethod === 'pix';
  if (to === 'completed') return paymentMethod === 'cash_on_delivery' || paymentMethod === 'card_on_delivery';
  return false;
}

/** docs/02 §5.2: "loja cancela sempre com motivo obrigatório". Mesma exigência pra delivery_failed (motivo da falha de entrega). */
export function orderTransitionRequiresReason(to: OrderStatus): boolean {
  return to === 'canceled' || to === 'delivery_failed';
}
