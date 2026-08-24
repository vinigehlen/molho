'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AdminOrder } from '@molho/contracts';
import { getStaffSession } from '../../lib/staff-session';
import { logoutStaffSession, refreshStaffSession } from '../../lib/staff-auth';
import { BOARD_COLUMNS, COLUMN_LABEL, confirmPayment, fetchActiveOrders, fetchOrder, groupByColumn } from '../../lib/orders-api';
import { applyOrderUpdate } from '../../lib/order-updates';
import { useOrdersStream } from '../../lib/use-orders-stream';
import { useReachability } from '../../lib/reachability';
import { useWakeLock } from '../../lib/use-wake-lock';
import { useOrderQueue } from '../../lib/use-order-queue';
import { isBackwardStaffTransition, isLegalStaffTransition, paymentGateReason } from '../../lib/order-queue';
import { Beeper, diffNewIds } from '../../lib/order-sound';
import { centsToBRL, fulfillmentDeadline, isoToTime } from '../../lib/format';
import { PrintingUnavailableError, queueKitchenTicketCopy } from '../../lib/printing-api';
import { disarmStream } from '../../lib/api-client';
import { PrintJobConsumer } from './print-job-consumer';
import { WhatsAppSheet } from './whatsapp-sheet';

/** Próxima ação do fluxo por status (o botão "Avançar" do card). */
const NEXT_ACTION: Partial<Record<AdminOrder['status'], { to: AdminOrder['status']; label: string }>> = {
  received: { to: 'preparing', label: 'Preparar' },
  preparing: { to: 'ready', label: 'Pronto' },
  in_transit: { to: 'completed', label: 'Concluir' },
};

const PREVIOUS_ACTION: Partial<Record<AdminOrder['status'], AdminOrder['status']>> = {
  preparing: 'received',
  ready: 'preparing',
  in_transit: 'ready',
};

function statusLabel(status: AdminOrder['status']): string {
  return status in COLUMN_LABEL ? COLUMN_LABEL[status as keyof typeof COLUMN_LABEL] : status;
}

function destinationLabel(order: AdminOrder): string {
  if (order.destination === 'delivery') return 'Delivery';
  if (order.destination === 'balcao') return 'Balcão';
  return 'Retirada';
}

function nextAction(order: AdminOrder): { to: AdminOrder['status']; label: string } | undefined {
  if (order.status === 'ready') {
    return order.destination === 'delivery'
      ? { to: 'in_transit', label: 'Saiu p/ entrega' }
      : { to: 'completed', label: 'Pronto p/ Retirar' };
  }
  return NEXT_ACTION[order.status];
}

/**
 * Board do gestor de pedidos (Épico 9). Load inicial via GET /v1/admin/orders;
 * o consumidor SSE atualiza este estado em tempo real. Sem sessão de staff,
 * o layout autenticado do 9b manda para o login.
 */
export default function GestorPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState('');
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
    setSoundOn(beeperRef.current.unlock());
  }

  useEffect(() => {
    const session = getStaffSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setTenantId(session.tenantId);
    setUserId(session.userId);
    setTenantName(session.tenantName);
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
    onExpired: async () => {
      const session = await refreshStaffSession();
      if (!session) router.replace('/login');
      return session !== null;
    },
  });

  // Mantém a tela do tablet acesa enquanto logado (re-pede ao voltar o foco).
  useWakeLock(tenantId !== null);

  // Alcançabilidade da API — DIFERENTE do stream. "sem conexão" só quando o
  // REST em si falha; stream caído com API alcançável é só "sem tempo real".
  const online = useReachability();

  // Fila offline: submit (online aplica / offline enfileira), sync na volta, conflitos.
  const { pending, conflicts, autoApplied, submit, sync, resolveConflict } = useOrderQueue(tenantId, userId, online);
  const pendingIds = new Set(pending.map((i) => i.orderId));

  // Confirmação de pagamento (item 6). Refetch pós-confirm atualiza board+painel;
  // o cutuque `payment_confirmed` faz o mesmo nos OUTROS tablets. NÃO passa pela
  // fila offline: é gateada por alcançabilidade (só habilita online), então nunca
  // é disparada offline pra precisar enfileirar.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Click-to-chat (Épico 11): qual pedido está com o sheet de aviso aberto.
  const [avisando, setAvisando] = useState<AdminOrder | null>(null);

  // Segunda via durável (Épico 10): o botão só enfileira. Quem imprime de fato
  // é o consumidor local da fila, via claim/printed/failed.
  const [printFeedback, setPrintFeedback] = useState<Record<string, { state: 'queueing' | 'queued' | 'failed'; message: string }>>({});
  const [loggingOut, setLoggingOut] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<AdminOrder['status'] | null>(null);
  const [reversal, setReversal] = useState<{ order: AdminOrder; toStatus: AdminOrder['status'] } | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  function requestTransition(order: AdminOrder, toStatus: AdminOrder['status']) {
    if (!isLegalStaffTransition(order.status, toStatus)) return;
    if (isBackwardStaffTransition(order.status, toStatus)) {
      setReversal({ order, toStatus });
      setReversalReason('');
      return;
    }
    void submit(order, toStatus);
  }

  function dropOrder(event: DragEvent<HTMLElement>, toStatus: AdminOrder['status']) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData('text/order-id') || draggingId;
    const order = orders?.find((candidate) => candidate.id === orderId);
    setDraggingId(null);
    setDropTarget(null);
    if (order) requestTransition(order, toStatus);
  }

  async function logout() {
    if (pending.length > 0) {
      if (!online) {
        const confirmed = window.confirm(
          `Há ${pending.length} ação(ões) ainda no aparelho. Elas ficam guardadas para o próximo login neste restaurante. Sair mesmo assim?`,
        );
        if (!confirmed) return;
      } else {
        const unresolved = await sync();
        if (unresolved > 0) {
          setError('Há ações pendentes que precisam da sua decisão antes de sair.');
          return;
        }
      }
    }

    setLoggingOut(true);
    setError(null);
    try {
      let disarmed = await disarmStream();
      if (!disarmed.ok) disarmed = await disarmStream();
      if (!disarmed.ok) throw new Error('Não foi possível encerrar o tempo real. Tente novamente.');
      if (!(await logoutStaffSession())) throw new Error('Não foi possível encerrar sua sessão. Tente novamente.');
      router.replace('/login');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível sair agora.');
    } finally {
      setLoggingOut(false);
    }
  }

  async function queuePrintCopy(order: AdminOrder) {
    setPrintFeedback((prev) => ({ ...prev, [order.id]: { state: 'queueing', message: 'Enfileirando…' } }));
    try {
      const key = `manual:${order.id}:${crypto.randomUUID()}`;
      await queueKitchenTicketCopy(order.id, key);
      setPrintFeedback((prev) => ({ ...prev, [order.id]: { state: 'queued', message: '2ª via na fila' } }));
    } catch (error) {
      const message = error instanceof PrintingUnavailableError ? 'Impressão não ativa' : 'Não deu pra enfileirar';
      setPrintFeedback((prev) => ({ ...prev, [order.id]: { state: 'failed', message } }));
    }
  }

  async function markPaid(order: AdminOrder) {
    setConfirmingId(order.id);
    try {
      // ok OU 409 (já confirmado / conflito de version): o fetch fresco reconcilia.
      // Só erro de rede/500 fica sem tratar aqui — some no próximo cutuque/refetch.
      await confirmPayment(order.id, order.version).catch(() => null);
      const fresh = await fetchOrder(order.id).catch(() => null);
      setOrders((prev) => (prev ? applyOrderUpdate(prev, order.id, fresh) : prev));
    } finally {
      setConfirmingId(null);
    }
  }

  if (error) {
    return (
      <main className="min-h-screen bg-bg p-6">
        <p className="text-critical">{error}</p>
      </main>
    );
  }

  const groups = orders ? groupByColumn(orders) : null;

  return (
    <main className="min-h-screen bg-bg p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Pedidos</h1>
          {tenantName && <p className="text-xs text-text-muted">{tenantName}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!online ? (
            <span className="rounded-full bg-critical px-3 py-1 text-xs font-medium text-white">
              Sem conexão — pedidos podem estar desatualizados
            </span>
          ) : (
            streamStatus !== 'open' && (
              <span className="rounded-full bg-caution px-3 py-1 text-xs font-medium text-white">
                Sem tempo real — reconectando…
              </span>
            )
          )}
          {!soundOn && (
            <button
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text"
              onClick={ativarSom}
            >
              Ativar som
            </button>
          )}
          <Link className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text" href="/gestor/configuracao">
            Configuração
          </Link>
          <Link className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text" href="/gestor/impressao">
            Impressão
          </Link>
          <Link className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text" href="/gestor/entrega">
            Entrega
          </Link>
          <Link className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text" href="/gestor/balcao">
            Balcão
          </Link>
          <Link className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text" href="/gestor/analytics">
            Analytics
          </Link>
          <button
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text disabled:opacity-50"
            onClick={() => void logout()}
            disabled={loggingOut}
          >
            {loggingOut ? 'Saindo…' : 'Sair'}
          </button>
          {tenantId && <PrintJobConsumer active={online} />}
        </div>
      </div>
      <div className="overflow-x-auto pb-3">
        <div className="grid min-w-[1520px] grid-cols-5 gap-4">
          {BOARD_COLUMNS.map((col) => (
            <section
              key={col}
              className={`min-w-0 rounded-[20px] border-2 p-3 transition-colors ${
                dropTarget === col ? 'border-brand bg-brand-faint' : 'border-transparent bg-bg-card'
              }`}
              onDragOver={(event) => {
                const order = orders?.find((candidate) => candidate.id === draggingId);
                if (!order || !isLegalStaffTransition(order.status, col)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTarget(col);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
              }}
              onDrop={(event) => dropOrder(event, col)}
              data-order-status={col}
            >
              <h2 className="mb-3 px-1 text-sm font-semibold text-text-muted">
                {COLUMN_LABEL[col]} {groups && <span className="tabular-nums">({groups[col].length})</span>}
              </h2>
              <div className="space-y-3">
                {groups
                  ? groups[col].map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        pending={pendingIds.has(order.id)}
                        online={online}
                        confirming={confirmingId === order.id}
                        onAdvance={(to) => void submit(order, to)}
                        onMove={(to) => requestTransition(order, to)}
                        onMarkPaid={() => void markPaid(order)}
                        onNotify={() => setAvisando(order)}
                        onPrint={() => void queuePrintCopy(order)}
                        printFeedback={printFeedback[order.id] ?? null}
                        dragging={draggingId === order.id}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/order-id', order.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingId(order.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                      />
                    ))
                  : // skeletons no load
                    Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-24 animate-pulse rounded-[14px] bg-bg" />
                    ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {conflicts.length > 0 && (
        <section className="mt-6 rounded-[20px] border border-critical bg-bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-critical">
            Ações não aplicadas — precisam da sua decisão ({conflicts.length})
          </h2>
          <ul className="space-y-2">
            {conflicts.map((c) => (
              <li key={c.intent.idempotencyKey} className="flex items-center justify-between gap-3 rounded-[14px] bg-bg p-3 text-sm">
                <span className="text-text">
                  {c.order?.customerName ?? 'Pedido'} → <strong>{c.intent.toStatus}</strong>: {c.reason}
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    className="rounded-[10px] bg-brand px-2 py-1 text-xs font-medium text-on-brand"
                    onClick={() => void resolveConflict(c.intent.idempotencyKey, 'reapply')}
                  >
                    Reaplicar
                  </button>
                  <button
                    className="rounded-[10px] border border-border px-2 py-1 text-xs text-text"
                    onClick={() => void resolveConflict(c.intent.idempotencyKey, 'discard')}
                  >
                    Descartar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {autoApplied.length > 0 && (
        <section className="mt-4 rounded-[20px] bg-bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-muted">Reaplicadas automaticamente na reconexão ({autoApplied.length})</h2>
          <ul className="space-y-1 text-xs text-text-muted">
            {autoApplied.map((a) => (
              <li key={a.intent.idempotencyKey} className="tabular-nums">
                {isoToTime(new Date(a.at).toISOString())} — pedido {a.intent.orderId.slice(0, 8)} → {a.intent.toStatus}
              </li>
            ))}
          </ul>
        </section>
      )}

      {avisando && <WhatsAppSheet order={avisando} onClose={() => setAvisando(null)} />}
      {reversal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <section
            className="w-full max-w-md rounded-[20px] bg-bg-card p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reversal-title"
          >
            <h2 id="reversal-title" className="text-lg font-semibold text-text">Voltar uma etapa?</h2>
            <p className="mt-2 text-sm text-text-muted">
              {reversal.order.customerName} voltará de <strong>{statusLabel(reversal.order.status)}</strong> para{' '}
              <strong>{statusLabel(reversal.toStatus)}</strong>. O motivo ficará no histórico.
            </p>
            <label className="mt-4 block text-sm font-medium text-text" htmlFor="reversal-reason">Motivo</label>
            <textarea
              id="reversal-reason"
              className="mt-1 min-h-24 w-full rounded-[14px] border border-border bg-bg p-3 text-sm text-text"
              value={reversalReason}
              onChange={(event) => setReversalReason(event.target.value)}
              maxLength={280}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-[10px] border border-border px-3 py-2 text-sm text-text" onClick={() => setReversal(null)}>
                Manter etapa
              </button>
              <button
                className="rounded-[10px] bg-brand px-3 py-2 text-sm font-medium text-on-brand disabled:opacity-50"
                disabled={!reversalReason.trim()}
                onClick={() => {
                  void submit(reversal.order, reversal.toStatus, reversalReason.trim());
                  setReversal(null);
                }}
              >
                Confirmar retorno
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function OrderCard({
  order,
  pending,
  online,
  confirming,
  onAdvance,
  onMove,
  onMarkPaid,
  onNotify,
  onPrint,
  printFeedback,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  order: AdminOrder;
  pending: boolean;
  online: boolean;
  confirming: boolean;
  onAdvance: (to: AdminOrder['status']) => void;
  onMove: (to: AdminOrder['status']) => void;
  onMarkPaid: () => void;
  onNotify: () => void;
  onPrint: () => void;
  printFeedback: { state: 'queueing' | 'queued' | 'failed'; message: string } | null;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [renderedAt] = useState(() => Date.now());
  const next = nextAction(order);
  const previous = PREVIOUS_ACTION[order.status];
  const advanceBlockReason = next ? paymentGateReason(order, next.to) : null;
  const printDisabled = printFeedback?.state === 'queueing';
  const deadline = fulfillmentDeadline(order, renderedAt);
  return (
    <article
      className={`rounded-[14px] border border-border bg-bg p-3 transition ${dragging ? 'opacity-50' : ''}`}
      draggable={!pending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Nome + horário + valor: a TRÍADE de reconciliação do PIX estático (§5.5) —
          é o que o lojista casa com o extrato do banco (o txid não é confiável). */}
      <button
        type="button"
        className="w-full cursor-pointer text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-medium text-text">{order.customerName}</span>
          <span className="shrink-0 text-right text-xs tabular-nums text-text-muted">
            <span className="block">{isoToTime(order.createdAt)}</span>
            <span className={`mt-0.5 block ${deadline.overdue ? 'font-semibold text-critical' : ''}`}>{deadline.text}</span>
          </span>
        </div>
        <span className="mt-1 inline-block rounded-full bg-brand-faint px-2 py-0.5 text-xs font-medium text-brand-strong">
          {destinationLabel(order)}
        </span>
        <div className="mt-1 flex items-center justify-between text-sm tabular-nums text-text">
          <span>{centsToBRL(order.totalCents)}</span>
          <span className="text-xs text-brand-strong">{expanded ? 'Ocultar detalhes ▲' : 'Ver detalhes ▼'}</span>
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
          {order.items.map((item, i) => (
            <li key={i} className="tabular-nums">{item.quantity}× {item.name}</li>
          ))}
        </ul>
      </button>

      {expanded && <OrderDetails order={order} />}

      <PaymentPanel order={order} online={online} confirming={confirming} onMarkPaid={onMarkPaid} />

      {advanceBlockReason && (
        <p className="mt-2 text-xs font-medium text-caution" role="status">
          {advanceBlockReason}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        {pending ? (
          <span className="rounded-full bg-caution px-2 py-0.5 text-xs font-medium text-white">ação pendente…</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Segunda via durável (Épico 10): cria `print_job`; o agente local
                imprime depois pelo claim da fila. Não muda estado do pedido. */}
            <button
              className="rounded-[10px] border border-border px-2 py-1 text-xs font-medium text-text"
              disabled={printDisabled}
              onClick={onPrint}
              aria-label="Imprimir comanda"
            >
              {printDisabled ? 'Enfileirando…' : '🖨️ Imprimir'}
            </button>
            {printFeedback && printFeedback.state !== 'queueing' && (
              <span
                className={`text-[11px] ${
                  printFeedback.state === 'queued' ? 'text-positive' : 'text-critical'
                }`}
                aria-live="polite"
              >
                {printFeedback.message}
              </span>
            )}
            {/* Click-to-chat (Épico 11): só precisa de rede quando o sheet abre
                (busca o telefone), então não é gateado por `online` como o
                "Marcar pago". */}
            <button
              className="rounded-[10px] border border-border px-2 py-1 text-xs font-medium text-text"
              onClick={onNotify}
            >
              💬 Avisar cliente
            </button>
          </div>
        )}
        {next && (
          <button
            className="rounded-[10px] bg-brand px-3 py-1 text-xs font-medium text-on-brand disabled:cursor-not-allowed disabled:opacity-50"
            disabled={advanceBlockReason !== null}
            onClick={() => onAdvance(next.to)}
            title={advanceBlockReason ?? undefined}
          >
            {next.label}
          </button>
        )}
        {previous && !pending && (
          <button
            className="rounded-[10px] border border-brand px-3 py-1 text-xs font-medium text-brand-strong"
            onClick={() => onMove(previous)}
          >
            Voltar etapa
          </button>
        )}
      </div>
    </article>
  );
}

function OrderDetails({ order }: { order: AdminOrder }) {
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs text-text-muted">
      <div>
        <p className="font-semibold text-text">Itens e observações</p>
        <ul className="mt-1 space-y-2">
          {order.items.map((item, index) => (
            <li key={index}>
              <span className="font-medium text-text">{item.quantity}× {item.name}</span>
              {item.modifiers.length > 0 && <p>+ {item.modifiers.map((modifier) => modifier.name).join(', ')}</p>}
              {item.notes && <p className="italic">Obs.: {item.notes}</p>}
            </li>
          ))}
        </ul>
      </div>
      {order.delivery && (
        <div>
          <p className="font-semibold text-text">Entrega</p>
          <p>{order.delivery.street}, {order.delivery.number ?? 's/n'}{order.delivery.complement ? ` — ${order.delivery.complement}` : ''}</p>
          <p>{order.delivery.neighborhood} — {order.delivery.city}/{order.delivery.state}</p>
          {order.delivery.referencePoint && <p>Referência: {order.delivery.referencePoint}</p>}
          {!order.delivery.postalCodeVerified && <p className="font-medium text-caution">Confira o endereço e a taxa antes de despachar.</p>}
        </div>
      )}
      <div className="flex justify-between tabular-nums"><span>Subtotal</span><span>{centsToBRL(order.subtotalCents)}</span></div>
      <div className="flex justify-between tabular-nums"><span>Taxa de entrega</span><span>{centsToBRL(order.deliveryFeeCents)}</span></div>
    </div>
  );
}

/**
 * Painel de reconciliação de pagamento (item 6). "Marcar pago" gateado por
 * ALCANÇABILIDADE DA API (`online`), NUNCA por streamStatus: sem tempo real o
 * REST ainda confirma; sem rede, não. Motivo do disable fica VISÍVEL. PIX é
 * pré-pago (bloqueia preparo, §5.5); pós-pago (dinheiro/cartão na entrega) só é
 * confirmado na entrega, então lá a confirmação vale a partir do "Saiu".
 */
function PaymentPanel({
  order,
  online,
  confirming,
  onMarkPaid,
}: {
  order: AdminOrder;
  online: boolean;
  confirming: boolean;
  onMarkPaid: () => void;
}) {
  if (order.paymentStatus === 'confirmado') {
    return <div className="mt-2 text-xs font-medium text-positive">✓ Pago</div>;
  }
  // Pós-pago só faz sentido confirmar a partir da saída pra entrega (recebe na
  // ponta). PIX pode ser confirmado assim que o dinheiro cai, ainda em Recebidos.
  const confirmavel = order.paymentMethod === 'pix' || order.status === 'in_transit';
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-caution px-2 py-0.5 text-xs font-medium text-white">Aguardando pagamento</span>
        {confirmavel && (
          <button
            className="rounded-[10px] bg-positive px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            disabled={!online || confirming}
            onClick={onMarkPaid}
          >
            {confirming ? 'Confirmando…' : 'Marcar pago'}
          </button>
        )}
      </div>
      {confirmavel && !online && (
        <span className="text-[11px] text-text-muted">Sem conexão com o sistema — reconecte pra confirmar o pagamento.</span>
      )}
    </div>
  );
}
