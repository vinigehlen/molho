'use client';

import { useEffect, useRef, useState } from 'react';
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
import { paymentGateReason } from '../../lib/order-queue';
import { Beeper, diffNewIds } from '../../lib/order-sound';
import { centsToBRL, isoToTime } from '../../lib/format';
import { PrintingUnavailableError, queueKitchenTicketCopy } from '../../lib/printing-api';
import { disarmStream } from '../../lib/api-client';
import { PrintJobConsumer } from './print-job-consumer';
import { WhatsAppSheet } from './whatsapp-sheet';

/** Próxima ação do fluxo por status (o botão "Avançar" do card). */
const NEXT_ACTION: Partial<Record<AdminOrder['status'], { to: AdminOrder['status']; label: string }>> = {
  received: { to: 'preparing', label: 'Preparar' },
  preparing: { to: 'ready', label: 'Pronto' },
  ready: { to: 'in_transit', label: 'Saiu p/ entrega' },
  in_transit: { to: 'completed', label: 'Concluir' },
};

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
    beeperRef.current.unlock();
    setSoundOn(true);
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
              🔔 Ativar som
            </button>
          )}
          <Link className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text" href="/gestor/impressao">
            🖨️ Impressão
          </Link>
          <Link className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text" href="/gestor/entrega">
            🛵 Entrega
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((col) => (
          <section key={col} className="rounded-[20px] bg-bg-card p-3">
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
                      onMarkPaid={() => void markPaid(order)}
                      onNotify={() => setAvisando(order)}
                      onPrint={() => void queuePrintCopy(order)}
                      printFeedback={printFeedback[order.id] ?? null}
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
    </main>
  );
}

function OrderCard({
  order,
  pending,
  online,
  confirming,
  onAdvance,
  onMarkPaid,
  onNotify,
  onPrint,
  printFeedback,
}: {
  order: AdminOrder;
  pending: boolean;
  online: boolean;
  confirming: boolean;
  onAdvance: (to: AdminOrder['status']) => void;
  onMarkPaid: () => void;
  onNotify: () => void;
  onPrint: () => void;
  printFeedback: { state: 'queueing' | 'queued' | 'failed'; message: string } | null;
}) {
  const next = NEXT_ACTION[order.status];
  const advanceBlockReason = next ? paymentGateReason(order, next.to) : null;
  const printDisabled = printFeedback?.state === 'queueing';
  return (
    <article className="rounded-[14px] border border-border bg-bg p-3">
      {/* Nome + horário + valor: a TRÍADE de reconciliação do PIX estático (§5.5) —
          é o que o lojista casa com o extrato do banco (o txid não é confiável). */}
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-text">{order.customerName}</span>
        <span className="text-xs tabular-nums text-text-muted">{isoToTime(order.createdAt)}</span>
      </div>
      {order.fulfillmentType === 'pickup' && (
        <span className="mt-1 inline-block rounded-full bg-brand-faint px-2 py-0.5 text-xs font-medium text-brand-strong">
          Retirada no balcão
        </span>
      )}
      <div className="mt-1 text-sm tabular-nums text-text">{centsToBRL(order.totalCents)}</div>
      <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
        {order.items.map((item, i) => (
          <li key={i} className="tabular-nums">
            {item.quantity}× {item.name}
          </li>
        ))}
      </ul>

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
      </div>
    </article>
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
