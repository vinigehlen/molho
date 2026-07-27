import type { AdminOrder } from '@molho/contracts';
import { BOARD_COLUMNS, type BoardColumn } from './orders-api';

function isActive(status: AdminOrder['status']): status is BoardColumn {
  return (BOARD_COLUMNS as readonly string[]).includes(status);
}

/**
 * Aplica ao board o resultado de um refetch disparado por um cutuque do stream.
 * `fetched === null` = o pedido sumiu (soft-delete/RLS) → remove. Se o pedido
 * saiu dos status ativos (completed/cancelado) → remove do board. Senão,
 * upsert preservando a posição (não reordena um card que só mudou de status).
 * Puro e testável — a ordenação FIFO do load inicial é mantida.
 */
export function applyOrderUpdate(orders: AdminOrder[], orderId: string, fetched: AdminOrder | null): AdminOrder[] {
  if (!fetched || !isActive(fetched.status)) {
    return orders.filter((o) => o.id !== orderId);
  }
  const idx = orders.findIndex((o) => o.id === fetched.id);
  if (idx === -1) return [...orders, fetched]; // novo pedido entra no fim (FIFO)
  const next = orders.slice();
  next[idx] = fetched;
  return next;
}
