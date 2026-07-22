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
 * `pending_payment`/`expired`/`auto_canceled` ficam mortos até o Épico 8
 * (PIX online): nenhum código de produção HOJE produz essas transições,
 * mas já estão aqui pra não precisar de migration quando o Épico 8 plugar
 * os timers. `delivery_failed` é terminal no MVP (decisão do Épico 7 —
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

/** docs/02 §5.2: "loja cancela sempre com motivo obrigatório". Mesma exigência pra delivery_failed (motivo da falha de entrega). */
export function orderTransitionRequiresReason(to: OrderStatus): boolean {
  return to === 'canceled' || to === 'delivery_failed';
}
