import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminOrder } from '@molho/contracts';
import { fetchOrder, transitionOrder } from './orders-api';
import { type QueuedIntent, enqueueIntent, evaluateIntent, loadQueue, removeIntent } from './order-queue';

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

  const sync = useCallback(async () => {
    if (!tenantId || !userId || syncing.current) return;
    syncing.current = true;
    try {
      for (const intent of loadQueue(tenantId)) {
        const order = await fetchOrder(intent.orderId).catch(() => null);
        const ev = evaluateIntent(intent, order, userId, Date.now());
        if (ev.action === 'drop') {
          removeIntent(tenantId, intent.idempotencyKey);
        } else if (ev.action === 'conflict') {
          removeIntent(tenantId, intent.idempotencyKey);
          setConflicts((c) => [...c, { intent, order, reason: ev.reason }]);
        } else if (order) {
          // apply: versão FRESCA (a precondição já confirmou que o estado bate).
          const res = await transitionOrder(order.id, intent.toStatus, order.version, intent.reason, intent.idempotencyKey);
          removeIntent(tenantId, intent.idempotencyKey);
          if (res.ok) setAutoApplied((a) => [...a, { intent, at: Date.now() }]);
          else setConflicts((c) => [...c, { intent, order, reason: `não aplicado (HTTP ${res.status})` }]);
        }
      }
      refresh();
    } finally {
      syncing.current = false;
    }
  }, [tenantId, userId, refresh]);

  // Quando volta online (ou no load) com fila pendente, sincroniza.
  useEffect(() => {
    if (online && tenantId && loadQueue(tenantId).length > 0) void sync();
  }, [online, tenantId, sync]);

  const resolveConflict = useCallback(async (idempotencyKey: string, action: 'reapply' | 'discard') => {
    let target: QueueConflict | undefined;
    setConflicts((c) => {
      target = c.find((x) => x.intent.idempotencyKey === idempotencyKey);
      return c.filter((x) => x.intent.idempotencyKey !== idempotencyKey);
    });
    if (action === 'discard' || !target) return;
    // Reaplicar: refetch pra versão FRESCA (o operador escolheu ver o estado e reaplicar). Chave nova (é uma decisão nova).
    const fresh = await fetchOrder(target.intent.orderId).catch(() => null);
    if (fresh) await transitionOrder(fresh.id, target.intent.toStatus, fresh.version, target.intent.reason, crypto.randomUUID());
  }, []);

  return { pending, conflicts, autoApplied, submit, resolveConflict };
}
