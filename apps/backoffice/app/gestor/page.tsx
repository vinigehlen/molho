'use client';

import React, { useEffect, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';
import type { AdminOrder } from '@molho/contracts';
import { getStaffSession } from '../../lib/staff-session';
import { refreshStaffSession } from '../../lib/staff-auth';
import {
  BOARD_COLUMNS,
  COLUMN_LABEL,
  confirmPayment,
  fetchActiveOrders,
  fetchOrder,
  groupByColumn,
  setOrderFlag,
  type BoardColumn,
} from '../../lib/orders-api';
import { applyOrderUpdate } from '../../lib/order-updates';
import { useOrdersStream } from '../../lib/use-orders-stream';
import { useReachability } from '../../lib/reachability';
import { useWakeLock } from '../../lib/use-wake-lock';
import { useOrderQueue } from '../../lib/use-order-queue';
import { isBackwardStaffTransition, isLegalStaffTransition } from '../../lib/order-queue';
import { Beeper, diffNewIds } from '../../lib/order-sound';
import { isoToTime } from '../../lib/format';
import { PrintingUnavailableError, queueKitchenTicketCopy } from '../../lib/printing-api';
import { OrderCard } from './order-card';
import { PrintJobConsumer } from './print-job-consumer';
import { WhatsAppSheet } from './whatsapp-sheet';

function statusLabel(status: AdminOrder['status']): string {
  return status in COLUMN_LABEL ? COLUMN_LABEL[status as keyof typeof COLUMN_LABEL] : status;
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
  // Board mobile-funcional (CLAUDE.md §6.3): abaixo de md, uma coluna de
  // cada vez com seletor por aba, não o grid desktop com scroll horizontal.
  const [mobileColumn, setMobileColumn] = useState<BoardColumn>(BOARD_COLUMNS[0]);
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
  const { pending, conflicts, autoApplied, submit, resolveConflict } = useOrderQueue(tenantId, userId, online);
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<AdminOrder['status'] | null>(null);
  const [reversal, setReversal] = useState<{ order: AdminOrder; toStatus: AdminOrder['status'] } | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Sinalização manual de pendência (Fase 3, plano do gestor). Dessinalizar
  // não precisa de motivo (é limpar um alerta que já cumpriu seu papel);
  // sinalizar abre um diálogo pra registrar POR QUE — vira o `flaggedReason`
  // que outro staff vê ao passar o mouse no card.
  const [flagDialog, setFlagDialog] = useState<AdminOrder | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  async function applyFlag(order: AdminOrder, flagged: boolean, reason: string | null) {
    // 409 (version desatualizada) é benigno, mesmo padrão de markPaid: o fetch fresco reconcilia.
    await setOrderFlag(order.id, order.version, flagged, reason).catch(() => null);
    const fresh = await fetchOrder(order.id).catch(() => null);
    setOrders((prev) => (prev ? applyOrderUpdate(prev, order.id, fresh) : prev));
  }

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

  const visibleOrders = onlyFlagged ? orders?.filter((o) => o.flaggedAt !== null) ?? null : orders;
  const groups = visibleOrders ? groupByColumn(visibleOrders) : null;
  const flaggedCount = orders?.filter((o) => o.flaggedAt !== null).length ?? 0;

  return (
    <main className="min-h-screen bg-bg p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Pedidos</h1>
          {tenantName && <p className="text-xs text-text-muted">{tenantName}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!online ? (
            <span className="rounded-full bg-critical-strong px-3 py-1 text-xs font-medium text-white">
              Sem conexão, pedidos podem estar desatualizados
            </span>
          ) : (
            streamStatus !== 'open' && (
              <span className="rounded-full bg-caution px-3 py-1 text-xs font-medium text-text">
                Sem tempo real, reconectando…
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
          {flaggedCount > 0 && (
            <button
              type="button"
              aria-pressed={onlyFlagged}
              onClick={() => setOnlyFlagged((value) => !value)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors ${
                onlyFlagged ? 'border-critical bg-critical/10 text-critical-strong' : 'border-border text-text-muted'
              }`}
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              Só sinalizados ({flaggedCount})
            </button>
          )}
          {tenantId && <PrintJobConsumer active={online} />}
        </div>
      </div>
      {/* Abaixo de md: abas de coluna — cada uma tem contagem própria, então o
          staff vê "tem pedido em Pronto" sem precisar estar olhando pra ela. */}
      {/* role="radiogroup", não tablist: em md+ as 5 colunas ficam TODAS
          visíveis ao mesmo tempo (grid), então não existe um único "painel
          selecionado" pra combinar com semântica de aba — é mais perto de um
          filtro de rádio de single-select mesmo (mesmo padrão do seletor de
          pagamento do balcão). */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 md:hidden" role="radiogroup" aria-label="Coluna do board">
        {BOARD_COLUMNS.map((col) => (
          <button
            key={col}
            role="radio"
            aria-checked={mobileColumn === col}
            onClick={() => setMobileColumn(col)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors ${
              mobileColumn === col ? 'border-brand bg-brand text-on-brand' : 'border-border text-text-muted'
            }`}
          >
            {COLUMN_LABEL[col]} {groups && `(${groups[col].length})`}
          </button>
        ))}
      </div>
      <div className="md:overflow-x-auto md:pb-3">
        <div className="grid grid-cols-1 gap-4 md:min-w-[1520px] md:grid-cols-5">
          {BOARD_COLUMNS.map((col) => (
            <section
              key={col}
              className={`min-w-0 rounded-[20px] border-2 p-3 transition-colors ${col === mobileColumn ? 'block' : 'hidden'} md:block ${
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
                        onFlag={() => {
                          setFlagDialog(order);
                          setFlagReason('');
                        }}
                        onUnflag={() => void applyFlag(order, false, null)}
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
            Ações não aplicadas, precisam da sua decisão ({conflicts.length})
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
                {isoToTime(new Date(a.at).toISOString())}: pedido {a.intent.orderId.slice(0, 8)} → {a.intent.toStatus}
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
      {flagDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <section
            className="w-full max-w-md rounded-[20px] bg-bg-card p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="flag-title"
          >
            <h2 id="flag-title" className="text-lg font-semibold text-text">Sinalizar pedido</h2>
            <p className="mt-2 text-sm text-text-muted">
              O pedido de {flagDialog.customerName} fica destacado no board até alguém dessinalizar.
            </p>
            <label className="mt-4 block text-sm font-medium text-text" htmlFor="flag-reason">Motivo (opcional)</label>
            <textarea
              id="flag-reason"
              className="mt-1 min-h-20 w-full rounded-[14px] border border-border bg-bg p-3 text-sm text-text"
              value={flagReason}
              onChange={(event) => setFlagReason(event.target.value)}
              maxLength={200}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-[10px] border border-border px-3 py-2 text-sm text-text" onClick={() => setFlagDialog(null)}>
                Cancelar
              </button>
              <button
                className="rounded-[10px] bg-critical-strong px-3 py-2 text-sm font-medium text-white"
                onClick={() => {
                  void applyFlag(flagDialog, true, flagReason.trim() || null);
                  setFlagDialog(null);
                }}
              >
                Sinalizar
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
