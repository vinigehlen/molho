'use client';

import { ArrowLeft, Clock3, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import {
  COPY,
  ORDER_TRACKING_TERMINAL_STATUSES,
  t,
  type OrderStatus,
  type OrderTrackingResponse,
} from '@molho/contracts';
import { formatCents, MoButton, MoCard, MoCardContent, MoTimeline, type MoTimelineStep } from '@molho/ui';
import { getOrderTracking } from '../../../../lib/order-tracking-api';

const POLL_MS = 18_000;

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Aguardando pagamento',
  received: 'Pedido recebido',
  preparing: 'Em preparo',
  ready: 'Pronto',
  in_transit: 'Saiu pra entrega',
  completed: 'Concluído',
  expired: 'Expirado',
  auto_canceled: 'Cancelado',
  canceled: 'Cancelado',
  delivery_failed: 'Entrega não concluída',
};

const HAPPY_FLOW: OrderStatus[] = ['received', 'preparing', 'ready', 'in_transit', 'completed'];
const TERMINAL = new Set<OrderStatus>(ORDER_TRACKING_TERMINAL_STATUSES);

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function timelineSteps(tracking: OrderTrackingResponse): { steps: MoTimelineStep[]; currentIndex: number } {
  const happened = new Map(tracking.timeline.map((item) => [item.status, item.at]));
  const flow = HAPPY_FLOW.includes(tracking.status) ? HAPPY_FLOW : [...HAPPY_FLOW.slice(0, 1), tracking.status];
  const activeIndex = Math.max(0, flow.indexOf(tracking.status));

  return {
    currentIndex: activeIndex,
    steps: flow.map((status) => ({
      id: status,
      label: STATUS_LABEL[status],
      at: formatTime(happened.get(status) ?? null) ?? undefined,
    })),
  };
}

export function OrderTrackingView({
  slug,
  token,
  storeName,
  initialTracking,
}: {
  slug: string;
  token: string;
  storeName: string;
  initialTracking: OrderTrackingResponse;
}) {
  const [tracking, setTracking] = React.useState(initialTracking);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState(() => new Date());
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await getOrderTracking(slug, token);
      if (fresh) {
        setTracking(fresh);
        setLastUpdatedAt(new Date());
      }
    } finally {
      setRefreshing(false);
    }
  }, [slug, token]);

  React.useEffect(() => {
    if (TERMINAL.has(tracking.status)) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh, tracking.status]);

  const deadline = formatTime(tracking.fulfillmentDeadlineAt);
  const { steps, currentIndex } = timelineSteps(tracking);
  const terminal = TERMINAL.has(tracking.status);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-3">
        <Link href={`/${slug}`} className="inline-flex w-fit items-center gap-1 text-caption text-brand-strong underline-offset-2 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Voltar pro cardápio
        </Link>
        <div className="flex flex-col gap-1">
          <p className="text-caption text-text-muted">{storeName}</p>
          <h1 className="text-title-lg text-text">{COPY.storefront.acompanhamento.titulo}</h1>
          <p className="text-body text-text-muted">{COPY.storefront.acompanhamento.subtitulo}</p>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-caption text-text-muted">Pedido #{tracking.orderId.slice(0, 8)}</p>
            <p className="text-title text-text">{STATUS_LABEL[tracking.status]}</p>
            {deadline ? (
              <p className="inline-flex items-center gap-2 text-body text-text-muted">
                <Clock3 className="h-4 w-4 text-brand-strong" aria-hidden="true" />
                {t(
                  tracking.fulfillmentType === 'pickup'
                    ? COPY.storefront.acompanhamento.retiradaAte
                    : COPY.storefront.acompanhamento.entregaAte,
                  { hora: deadline },
                )}
              </p>
            ) : null}
          </div>
          <MoButton variant="secondary" onClick={() => void refresh()} loading={refreshing}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {COPY.storefront.acompanhamento.atualizar}
          </MoButton>
        </div>
        <p className="mt-3 text-caption text-text-muted">
          {t(COPY.storefront.acompanhamento.atualizadoAs, {
            hora: lastUpdatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          })}
          {terminal ? ` · ${COPY.storefront.acompanhamento.terminal}` : null}
        </p>
      </section>

      {tracking.status === 'canceled' || tracking.status === 'auto_canceled' || tracking.status === 'delivery_failed' ? (
        <section className="rounded-lg border border-critical-strong bg-critical/10 p-4">
          <p className="text-body-strong text-critical-strong">{COPY.storefront.acompanhamento.cancelado}</p>
          {tracking.canceledReason ? (
            <p className="mt-1 text-body text-text-muted">{tracking.canceledReason}</p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-bg-card p-4">
        <MoTimeline steps={steps} currentIndex={currentIndex} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-title text-text">{COPY.storefront.acompanhamento.itens}</h2>
          <span className="text-body-strong tnum text-text">{formatCents(tracking.totalCents)}</span>
        </div>
        <MoCard>
          <MoCardContent className="divide-y divide-border p-0">
            {tracking.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 p-4">
                <span className="text-body text-text">{item.name}</span>
                <span className="shrink-0 text-caption text-text-muted">x{item.quantity}</span>
              </div>
            ))}
          </MoCardContent>
        </MoCard>
      </section>
    </main>
  );
}
