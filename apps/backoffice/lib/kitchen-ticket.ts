import type { AdminOrder } from '@molho/contracts';

/**
 * Comanda de cozinha (fallback universal do Épico 10, docs/02 §6) — puro,
 * testável sem montar DOM. O componente de UI (`app/gestor/kitchen-ticket.tsx`)
 * só consome isto e os campos de `order` que já não precisam de formatação
 * (itens, modificadores, observação).
 */

/** "3F8A21B0" — 8 primeiros chars do uuid, o mesmo recorte usado no board pra identificar pedido sem expor o id inteiro. */
export function ticketNumber(order: AdminOrder): string {
  return order.id.slice(0, 8).toUpperCase();
}

/** "Entrega" ou "Retirada no balcão" — nunca o endereço (fica de fora de propósito: a cozinha não precisa dele). */
export function fulfillmentLabel(order: AdminOrder): string {
  return order.fulfillmentType === 'pickup' ? 'Retirada no balcão' : 'Entrega';
}
