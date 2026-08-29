import type { AdminOrder } from '@molho/contracts';
import { apiFetch } from './api-client';

/**
 * Colunas do board (statuses ativos), na ordem do fluxo. Duplicado de
 * ACTIVE_ORDER_STATUSES de @molho/contracts DE PROPÓSITO: importar VALOR de
 * @molho/contracts num client component quebra (boilerplate de Fast Refresh no
 * CommonJS compilado — ver apps/storefront/lib/storefront-api.ts). Só o TIPO
 * (`AdminOrder`) é importado, e tipo é apagado no build. Se a máquina de
 * estados mudar, este array acompanha (teste cravaria a divergência se houver).
 */
export const BOARD_COLUMNS = ['received', 'preparing', 'ready', 'in_transit', 'completed'] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const COLUMN_LABEL: Record<BoardColumn, string> = {
  received: 'Recebidos',
  preparing: 'Preparando',
  ready: 'Prontos',
  in_transit: 'Saíram',
  completed: 'Finalizados',
};

export async function fetchActiveOrders(): Promise<AdminOrder[]> {
  const res = await apiFetch('/v1/admin/orders');
  if (!res.ok) throw new Error(`Falha ao carregar pedidos (${res.status})`);
  return (await res.json()) as AdminOrder[];
}

export async function fetchOrder(id: string): Promise<AdminOrder | null> {
  const res = await apiFetch(`/v1/admin/orders/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao carregar pedido (${res.status})`);
  return (await res.json()) as AdminOrder;
}

export async function transitionOrder(
  id: string,
  toStatus: AdminOrder['status'],
  version: number,
  reason: string | null,
  idempotencyKey?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  return apiFetch(`/v1/admin/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ toStatus, version, reason: reason ?? undefined }),
  });
}

/**
 * Reconciliação manual do PIX estático (item 6, Épico 8→9): o lojista confere o
 * valor/horário/nome no extrato e marca pago. Endpoint método-agnóstico (§5.5)
 * — serve tanto o gate de preparo do PIX quanto o gate de conclusão dos
 * pós-pagos. 409 (PaymentAlreadyConfirmedError OU conflito de version) é BENIGNO
 * aqui: quem chama refaz o fetch e o paymentStatus fresco conta a verdade — não
 * é falha de UI (o outro tablet pode ter confirmado no meio, via cutuque).
 */
export async function confirmPayment(id: string, version: number): Promise<Response> {
  return apiFetch(`/v1/admin/orders/${encodeURIComponent(id)}/payment/confirm`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version }),
  });
}

/**
 * Sinalizar/dessinalizar pendência (Fase 3, plano do gestor). 409 é benigno
 * pelo mesmo motivo de `confirmPayment`: outro tablet pode ter mexido no
 * pedido no meio — quem chama refaz o fetch.
 */
export async function setOrderFlag(id: string, version: number, flagged: boolean, reason: string | null): Promise<Response> {
  return apiFetch(`/v1/admin/orders/${encodeURIComponent(id)}/flag`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version, flagged, reason: reason ?? undefined }),
  });
}

/**
 * Telefone do cliente pro click-to-chat (Épico 11). Buscado SÓ no clique do
 * botão: PII não trafega no payload do board. 403 = módulo `notify.whatsapp_ctc`
 * desligado pro tenant — devolve `null` igual ao 404, quem chama mostra o
 * mesmo "não deu pra avisar por aqui" (o lojista não precisa saber se foi
 * módulo ou pedido sumido, e a UI não tem ação diferente pra cada caso).
 */
export async function fetchCustomerPhone(id: string): Promise<string | null> {
  const res = await apiFetch(`/v1/admin/orders/${encodeURIComponent(id)}/customer-phone`);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Falha ao buscar o telefone (${res.status})`);
  return ((await res.json()) as { phone: string }).phone;
}

/** Agrupa pedidos por coluna do board, preservando a ordem de chegada (FIFO). Puro, testável. */
export function groupByColumn(orders: AdminOrder[]): Record<BoardColumn, AdminOrder[]> {
  const groups: Record<BoardColumn, AdminOrder[]> = { received: [], preparing: [], ready: [], in_transit: [], completed: [] };
  for (const order of orders) {
    if (order.status in groups) groups[order.status as BoardColumn].push(order);
  }
  return groups;
}
