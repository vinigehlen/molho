import type { AdminOrder } from '@molho/contracts';

/** Minutos → ms. TTL do intent: 30min (docs — parâmetro a calibrar no piloto, não princípio). */
export const INTENT_TTL_MS = 30 * 60 * 1000;

/**
 * Um intent de transição enfileirado offline (Épico 9). `idempotencyKey` gerada
 * na hora de enfileirar (a MESMA em todo retry). `fromStatus` = status que o
 * operador VIU ao agir (a precondição semântica compara com o status atual).
 * `userId` = quem enfileirou (intent de outro operador nunca auto-aplica).
 */
export interface QueuedIntent {
  orderId: string;
  fromStatus: AdminOrder['status'];
  toStatus: AdminOrder['status'];
  expectedVersion: number;
  reason: string | null;
  idempotencyKey: string;
  userId: string;
  enqueuedAt: number; // epoch ms
}

/** Transições que o gestor aciona (mesma máquina do backend, subconjunto do staff). */
const LEGAL_NEXT: Record<string, readonly AdminOrder['status'][]> = {
  received: ['preparing', 'canceled'],
  preparing: ['ready', 'canceled'],
  ready: ['in_transit'],
  in_transit: ['completed', 'delivery_failed'],
};

function isLegal(from: AdminOrder['status'], to: AdminOrder['status']): boolean {
  return (LEGAL_NEXT[from] ?? []).includes(to);
}

/** Gate §5.5 client-side (espelha transitionRequiresConfirmedPayment do backend) — pra decidir auto-aplicar sem round-trip inútil. */
function paymentGateBlocks(order: AdminOrder, to: AdminOrder['status']): boolean {
  if (order.paymentStatus === 'confirmado') return false;
  if (to === 'preparing') return order.paymentMethod === 'pix';
  if (to === 'completed') return order.paymentMethod === 'cash_on_delivery' || order.paymentMethod === 'card_on_delivery';
  return false;
}

export type IntentEvaluation =
  | { action: 'apply' }
  | { action: 'conflict'; reason: string }
  | { action: 'drop'; reason: string };

/**
 * Precondição semântica de auto-aplicação (regra aprovada): auto-aplica SÓ se
 * (a) status atual == o que o operador viu, (b) transição legal, (c) gate §5.5
 * passa — E não for de outro operador, não estiver velho, e o pedido existir.
 * Qualquer falha → bandeja de conflitos (NUNCA descarta em silêncio). Puro.
 *
 * `order === null` = pedido sumiu (RLS/soft-delete) → conflito, não apply.
 */
export function evaluateIntent(
  intent: QueuedIntent,
  order: AdminOrder | null,
  currentUserId: string,
  now: number,
): IntentEvaluation {
  if (intent.userId !== currentUserId) {
    return { action: 'conflict', reason: 'ação pendente de outro operador' };
  }
  if (now - intent.enqueuedAt > INTENT_TTL_MS) {
    return { action: 'conflict', reason: 'ação antiga (enfileirada há mais de 30 min)' };
  }
  if (!order) {
    return { action: 'conflict', reason: 'pedido não existe mais' };
  }
  if (order.status === intent.toStatus) {
    // Já está no destino (outro operador/aba aplicou, ou replay) — intenção satisfeita, descarta limpo.
    return { action: 'drop', reason: 'já está neste status' };
  }
  if (order.status !== intent.fromStatus) {
    return { action: 'conflict', reason: `o pedido mudou (está em "${order.status}", você agiu em "${intent.fromStatus}")` };
  }
  if (!isLegal(intent.fromStatus, intent.toStatus)) {
    return { action: 'conflict', reason: 'a transição não é mais válida' };
  }
  if (paymentGateBlocks(order, intent.toStatus)) {
    return { action: 'conflict', reason: 'o pagamento precisa ser confirmado antes desta etapa' };
  }
  return { action: 'apply' };
}

// ─── Persistência (localStorage por tenant; intents carregam userId) ──────────

const KEY_PREFIX = 'molho.order-queue.';

export function loadQueue(tenantId: string): QueuedIntent[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(KEY_PREFIX + tenantId);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedIntent[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(tenantId: string, queue: QueuedIntent[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY_PREFIX + tenantId, JSON.stringify(queue));
}

export function enqueueIntent(tenantId: string, intent: QueuedIntent): void {
  saveQueue(tenantId, [...loadQueue(tenantId), intent]);
}

export function removeIntent(tenantId: string, idempotencyKey: string): void {
  saveQueue(tenantId, loadQueue(tenantId).filter((i) => i.idempotencyKey !== idempotencyKey));
}
