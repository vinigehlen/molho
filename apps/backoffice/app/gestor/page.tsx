'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminOrder } from '@molho/contracts';
import { getStaffSession } from '../../lib/staff-session';
import { BOARD_COLUMNS, COLUMN_LABEL, fetchActiveOrders, groupByColumn } from '../../lib/orders-api';
import { centsToBRL, isoToTime } from '../../lib/format';

/**
 * Board do gestor de pedidos (Épico 9). Load inicial via GET /v1/admin/orders;
 * o consumidor SSE (próximo commit) passa a atualizar este estado em tempo real.
 * Sem sessão de staff → manda pro login (dev por enquanto, 9b real depois).
 */
export default function GestorPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getStaffSession()) {
      router.replace('/dev-login');
      return;
    }
    fetchActiveOrders()
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }, [router]);

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
      <h1 className="mb-4 text-xl font-semibold text-text">Pedidos</h1>
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
