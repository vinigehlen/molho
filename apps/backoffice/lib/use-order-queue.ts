import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminOrder } from '@molho/contracts';
import { fetchOrder, transitionOrder } from './orders-api';
import { type QueuedIntent, enqueueIntent, loadQueue } from './order-queue';
import { syncOrderQueue } from './order-queue-sync';

export interface QueueConflict {
  intent: QueuedIntent;
  order: AdminOrder | null;
  reason: string;
}
export interface AutoApplied {
  intent: QueuedIntent;
  at: number;
}

/**
 * Orquestra a fila offline (Épico 9): submit (online aplica já / offline
 * enfileira), sync na volta da conexão (avalia cada intent com a precondição
 * semântica — auto-aplica / bandeja / descarta limpo), e resolução de conflito.
 * A decisão de cada intent é o `evaluateIntent` puro (testado); aqui é o I/O.
 */
export function useOrderQueue(tenantId: string | null, userId: string | null, online: boolean) {
  const [pending, setPending] = useState<QueuedIntent[]>([]);
  const [conflicts, setConflicts] = useState<QueueConflict[]>([]);
  const [autoApplied, setAutoApplied] = useState<AutoApplied[]>([]);
  const syncing = useRef(false);

  const refresh = useCallback(() => {
    if (tenantId) setPending(loadQueue(tenantId));
  }, [tenantId]);

  useEffect(() => refresh(), [refresh]);

  const submit = useCallback(
    async (order: AdminOrder, toStatus: AdminOrder['status'], reason: string | null = null) => {
      if (!tenantId || !userId) return;
      const intent: QueuedIntent = {
        orderId: order.id,
        fromStatus: order.status,
        toStatus,
        expectedVersion: order.version,
        reason,
        idempotencyKey: crypto.randomUUID(),
        userId,
        enqueuedAt: Date.now(),
      };
      if (!online) {
        enqueueIntent(tenantId, intent);
        refresh();
        return;
      }
      try {
        const res = await transitionOrder(order.id, toStatus, order.version, reason, intent.idempotencyKey);
        if (!res.ok) {
          // Conflito ONLINE (409/gate) — bandeja com o estado atual, nunca some.
          const fresh = await fetchOrder(order.id).catch(() => null);
          setConflicts((c) => [...c, { intent, order: fresh, reason: `não aplicado (HTTP ${res.status})` }]);
        }
        // sucesso: o SSE atualiza o board (order_status → refetch)
      } catch {
        // fetch LANÇOU = offline de verdade → enfileira (apiFetch já marcou offline)
        enqueueIntent(tenantId, intent);
        refresh();
      }
    },
    [tenantId, userId, online, refresh],
  );

  const sync = useCallback(async (): Promise<number> => {
    if (!tenantId || !userId || syncing.current) return 0;
    syncing.current = true;
    try {
      const result = await syncOrderQueue(tenantId, userId);
      if (result.conflicts.length > 0) setConflicts((c) => [...c, ...result.conflicts]);
      if (result.autoApplied.length > 0) setAutoApplied((a) => [...a, ...result.autoApplied]);
      refresh();
      return result.unresolved;
    } finally {
      syncing.current = false;
    }
  }, [tenantId, userId, refresh]);

  // Quando volta online (ou no load) com fila pendente, sincroniza.
  useEffect(() => {
    if (online && tenantId && loadQueue(tenantId).length > 0) void sync();
  }, [online, tenantId, sync]);

  const resolveConflict = useCallback(
    async (idempotencyKey: string, action: 'reapply' | 'discard') => {
      const target = conflicts.find((x) => x.intent.idempotencyKey === idempotencyKey);
      setConflicts((c) => c.filter((x) => x.intent.idempotencyKey !== idempotencyKey));
      if (action === 'discard' || !target) return;
      // Reaplicar: refetch pra versão FRESCA (o operador escolheu ver o estado e reaplicar). Chave nova (é uma decisão nova).
      const fresh = await fetchOrder(target.intent.orderId).catch(() => null);
      if (fresh) await transitionOrder(fresh.id, target.intent.toStatus, fresh.version, target.intent.reason, crypto.randomUUID());
    },
    [conflicts],
  );

  return { pending, conflicts, autoApplied, submit, sync, resolveConflict };
}
