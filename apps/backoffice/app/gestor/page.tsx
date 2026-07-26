'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminOrder } from '@molho/contracts';
import { getStaffSession } from '../../lib/staff-session';
import { BOARD_COLUMNS, COLUMN_LABEL, fetchActiveOrders, fetchOrder, groupByColumn } from '../../lib/orders-api';
import { applyOrderUpdate } from '../../lib/order-updates';
import { useOrdersStream } from '../../lib/use-orders-stream';
import { Beeper, diffNewIds } from '../../lib/order-sound';
import { centsToBRL, isoToTime } from '../../lib/format';

/**
 * Board do gestor de pedidos (Épico 9). Load inicial via GET /v1/admin/orders;
 * o consumidor SSE (próximo commit) passa a atualizar este estado em tempo real.
 * Sem sessão de staff → manda pro login (dev por enquanto, 9b real depois).
 */
export default function GestorPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const beeperRef = useRef<Beeper | null>(null);
  const seenIdsRef = useRef<Set<string> | null>(null); // null = load inicial ainda não semeado

  // Som por diff de ids: id nunca visto → beep. O 1º load só SEMEIA o conjunto
  // (não toca — senão o board inteiro apitaria ao abrir). Depois, todo id novo
  // (incluindo os que chegaram na janela offline, pegos no refetch da
  // reconexão) toca. Ver lib/order-sound.ts.
  useEffect(() => {
    if (!orders) return;
    const ids = orders.map((o) => o.id);
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(ids);
      return;
    }
    const novos = diffNewIds(seenIdsRef.current, ids);
    if (novos.length > 0) {
      beeperRef.current?.beep();
      for (const id of novos) seenIdsRef.current.add(id);
    }
  }, [orders]);

  function ativarSom() {
    beeperRef.current ??= new Beeper();
    beeperRef.current.unlock();
    setSoundOn(true);
  }

  useEffect(() => {
    const session = getStaffSession();
    if (!session) {
      router.replace('/dev-login');
      return;
    }
    setTenantId(session.tenantId);
    fetchActiveOrders()
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }, [router]);

  const streamStatus = useOrdersStream(tenantId, {
    // Cutuque magro → refaz o GET REST (passa pela RLS) → upsert/remove no board.
    onNudge: async ({ orderId }) => {
      const fetched = await fetchOrder(orderId).catch(() => null);
      setOrders((prev) => (prev ? applyOrderUpdate(prev, orderId, fetched) : prev));
    },
    onExpired: () => router.replace('/dev-login'),
  });

  if (error) {
    return (
      <main className="min-h-screen bg-bg p-6">
        <p className="text-danger">{error}</p>
      </main>
    );
  }

  const groups = orders ? groupByColumn(orders) : null;

  return (
    <main className="min-h-screen bg-bg p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Pedidos</h1>
        <div className="flex items-center gap-2">
          {streamStatus !== 'open' && (
            <span className="rounded-full bg-danger px-3 py-1 text-xs font-medium text-white">
              Sem conexão — tentando reconectar…
            </span>
          )}
          {!soundOn && (
            <button
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text"
              onClick={ativarSom}
            >
              🔔 Ativar som
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((col) => (
          <section key={col} className="rounded-[20px] bg-surface p-3">
            <h2 className="mb-3 px-1 text-sm font-semibold text-text-muted">
              {COLUMN_LABEL[col]} {groups && <span className="tabular-nums">({groups[col].length})</span>}
            </h2>
            <div className="space-y-3">
              {groups
                ? groups[col].map((order) => <OrderCard key={order.id} order={order} />)
                : // skeletons no load
                  Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-[14px] bg-bg" />
                  ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function OrderCard({ order }: { order: AdminOrder }) {
  return (
    <article className="rounded-[14px] border border-border bg-bg p-3">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-text">{order.customerName}</span>
        <span className="text-xs tabular-nums text-text-muted">{isoToTime(order.createdAt)}</span>
      </div>
      <div className="mt-1 text-sm tabular-nums text-text">{centsToBRL(order.totalCents)}</div>
      <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
        {order.items.map((item, i) => (
          <li key={i} className="tabular-nums">
            {item.quantity}× {item.name}
          </li>
        ))}
      </ul>
    </article>
  );
}
