import type { AdminOrder } from '@molho/contracts';
import { fetchOrder, transitionOrder } from './orders-api';
import { evaluateIntent, loadQueue, removeIntent, type QueuedIntent } from './order-queue';

export interface SyncConflict {
  intent: QueuedIntent;
  order: AdminOrder | null;
  reason: string;
}
export interface SyncApplied {
  intent: QueuedIntent;
  at: number;
}
export interface SyncResult {
  unresolved: number;
  conflicts: SyncConflict[];
  autoApplied: SyncApplied[];
}

/**
 * Percorre a fila offline e aplica/descarta/bandeja cada intent — puro I/O,
 * sem estado React. Extraído de `useOrderQueue` pra também servir o logout
 * global (sidebar, Épico 9b item 3): uma chamada avulsa, sem instância viva
 * do hook, então não corre risco de duas cópias do mesmo estado divergindo.
 */
export async function syncOrderQueue(tenantId: string, userId: string): Promise<SyncResult> {
  const conflicts: SyncConflict[] = [];
  const autoApplied: SyncApplied[] = [];
  let unresolved = 0;
  for (const intent of loadQueue(tenantId)) {
    const order = await fetchOrder(intent.orderId).catch(() => null);
    const ev = evaluateIntent(intent, order, userId, Date.now());
    if (ev.action === 'drop') {
      removeIntent(tenantId, intent.idempotencyKey);
    } else if (ev.action === 'conflict') {
      unresolved += 1;
      removeIntent(tenantId, intent.idempotencyKey);
      conflicts.push({ intent, order, reason: ev.reason });
    } else if (order) {
      // apply: versão FRESCA (a precondição já confirmou que o estado bate).
      const res = await transitionOrder(order.id, intent.toStatus, order.version, intent.reason, intent.idempotencyKey);
      removeIntent(tenantId, intent.idempotencyKey);
      if (res.ok) autoApplied.push({ intent, at: Date.now() });
      else {
        unresolved += 1;
        conflicts.push({ intent, order, reason: `não aplicado (HTTP ${res.status})` });
      }
    }
  }
  return { unresolved, conflicts, autoApplied };
}
