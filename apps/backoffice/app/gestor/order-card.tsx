'use client';

import React, { memo, useState, type DragEvent } from 'react';
import { ChevronDown, ChevronUp, CircleCheck, Flag, MessageCircle, Printer } from 'lucide-react';
import type { AdminOrder } from '@molho/contracts';
import { MoBadge, MoButton } from '@molho/ui';
import { paymentGateReason } from '../../lib/order-queue';
import { centsToBRL, fulfillmentDeadline, isoToTime } from '../../lib/format';

/**
 * Extraído de `page.tsx` (Fase 3, plano do gestor): Next.js 15 App Router só
 * aceita exports reservados (default, generateMetadata…) num `page.tsx` — um
 * export nomeado extra (`OrderCard`, pra testabilidade) quebra o build com
 * "is not a valid Page export field". `page.test.tsx` importa daqui, não de
 * `./page`.
 */

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

function destinationLabel(order: AdminOrder): string {
  if (order.destination === 'delivery') return 'Delivery';
  if (order.destination === 'balcao') return 'Balcão';
  return 'Retirada';
}

function nextAction(order: AdminOrder): { to: AdminOrder['status']; label: string } | undefined {
  if (order.status === 'ready') {
    // Rótulo curto de propósito (Fase 1, plano do gestor): "Saiu p/ entrega"/
    // "Pronto p/ Retirar" eram frase dentro de botão de coluna estreita —
    // quebrava em 2 linhas e desalinhava a altura dos cards vizinhos.
    return order.destination === 'delivery'
      ? { to: 'in_transit', label: 'Despachar' }
      : { to: 'completed', label: 'Retirada' };
  }
  return NEXT_ACTION[order.status];
}

interface OrderCardProps {
  order: AdminOrder;
  pending: boolean;
  online: boolean;
  confirming: boolean;
  onAdvance: (to: AdminOrder['status']) => void;
  onMove: (to: AdminOrder['status']) => void;
  onMarkPaid: () => void;
  onNotify: () => void;
  onPrint: () => void;
  onFlag: () => void;
  onUnflag: () => void;
  printFeedback: { state: 'queueing' | 'queued' | 'failed'; message: string } | null;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

/**
 * Memoizado com comparador próprio: os callbacks (onAdvance, onMove…) são
 * closures novas a cada render do board — comparação rasa padrão do memo()
 * nunca bateria neles, então o memo não pegaria nada. `applyOrderUpdate`
 * (order-updates.ts) já preserva a referência de `order` pra pedido que não
 * mudou; comparar só o que carrega estado real (order, flags, printFeedback)
 * é o que faz um nudge do SSE re-renderizar só o card afetado, não a coluna
 * inteira.
 */
export const OrderCard = memo(function OrderCard({
  order,
  pending,
  online,
  confirming,
  onAdvance,
  onMove,
  onMarkPaid,
  onNotify,
  onPrint,
  onFlag,
  onUnflag,
  printFeedback,
  dragging,
  onDragStart,
  onDragEnd,
}: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [renderedAt] = useState(() => Date.now());
  const next = nextAction(order);
  const previous = PREVIOUS_ACTION[order.status];
  const advanceBlockReason = next ? paymentGateReason(order, next.to) : null;
  const printDisabled = printFeedback?.state === 'queueing';
  const deadline = fulfillmentDeadline(order, renderedAt);
  return (
    <article
      className={`rounded-[14px] border bg-bg p-3 transition ${dragging ? 'opacity-50' : ''} ${
        order.flaggedAt ? 'border-critical' : 'border-border'
      }`}
      draggable={!pending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {order.flaggedAt && (
        <div className="mb-2 flex items-start gap-1.5 rounded-md bg-critical/10 px-2 py-1.5 text-xs text-critical-strong">
          <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{order.flaggedReason || 'Sinalizado — precisa de atenção'}</span>
        </div>
      )}
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
            {/* Selo de prazo em 3 cores (Fase 2, plano do gestor — padrão
                iFood): verde até a metade do tempo, âmbar da metade em
                diante, vermelho no atraso. Dot, não pílula cheia — o
                cabeçalho do card é estreito demais pra outra badge inteira
                ao lado do horário. */}
            <span
              className={`mt-0.5 inline-flex items-center gap-1 ${
                deadline.severity === 'critical' ? 'font-semibold text-critical' : deadline.severity === 'warning' ? 'text-caution' : ''
              }`}
            >
              {/* Sem dot pra "Prazo não registrado" — pedido legado não tem
                  prazo pra estar "em dia" com, um dot verde ali mentiria. */}
              {deadline.text !== 'Prazo não registrado' && (
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    deadline.severity === 'critical' ? 'bg-critical' : deadline.severity === 'warning' ? 'bg-caution' : 'bg-positive'
                  }`}
                  aria-hidden="true"
                />
              )}
              {deadline.text}
            </span>
          </span>
        </div>
        <span className="mt-1 inline-block rounded-full bg-brand-faint px-2 py-0.5 text-xs font-medium text-brand-strong">
          {destinationLabel(order)}
        </span>
        <div className="mt-1 flex items-center justify-between text-sm tabular-nums text-text">
          <span>{centsToBRL(order.totalCents)}</span>
          <span className="inline-flex items-center gap-1 text-xs text-brand-strong">
            {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
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

      {/* Barra de ação: 2 zonas fixas (Fase 1, plano do gestor) — utilitários
          (ícone-only, 44×44, alvo de toque §6.1) à esquerda, ação principal +
          "voltar etapa" à direita. Nunca mais frase dentro de botão: é o que
          fazia "Saiu p/ entrega"/"Voltar etapa" quebrarem em 2 linhas e cada
          card da coluna terminar com uma altura diferente da vizinha. */}
      {/* flex-wrap: com 3 ícones (Fase 3 somou "Sinalizar") + Voltar etapa +
          CTA, a linha some da largura do card em coluna estreita — sem wrap
          o excesso vazava por cima da coluna vizinha em vez de quebrar. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {pending ? (
          <MoBadge variant="caution">ação pendente…</MoBadge>
        ) : (
          <div className="flex items-center gap-1.5">
            {/* Segunda via durável (Épico 10): cria `print_job`; o agente local
                imprime depois pelo claim da fila. Não muda estado do pedido. */}
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
              disabled={printDisabled}
              onClick={onPrint}
              aria-label={printDisabled ? 'Enfileirando segunda via…' : 'Imprimir comanda'}
              title={printDisabled ? 'Enfileirando…' : 'Imprimir'}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
            </button>
            {/* Click-to-chat (Épico 11): só precisa de rede quando o sheet abre
                (busca o telefone), então não é gateado por `online` como o
                "Marcar pago". */}
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition hover:bg-bg"
              onClick={onNotify}
              aria-label="Avisar cliente"
              title="Avisar cliente"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </button>
            {/* Sinalização manual de pendência (Fase 3, plano do gestor). */}
            <button
              type="button"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition hover:bg-bg ${
                order.flaggedAt ? 'border-critical text-critical-strong' : 'border-border text-text-muted'
              }`}
              onClick={order.flaggedAt ? onUnflag : onFlag}
              aria-label={order.flaggedAt ? 'Dessinalizar pedido' : 'Sinalizar pedido'}
              title={order.flaggedAt ? 'Dessinalizar' : 'Sinalizar'}
            >
              <Flag className="h-4 w-4" aria-hidden="true" fill={order.flaggedAt ? 'currentColor' : 'none'} />
            </button>
            {printFeedback && printFeedback.state !== 'queueing' && (
              <span
                className={`text-[11px] ${printFeedback.state === 'queued' ? 'text-positive' : 'text-critical'}`}
                aria-live="polite"
              >
                {printFeedback.message}
              </span>
            )}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          {previous && !pending && (
            <MoButton variant="secondary" size="sm" onClick={() => onMove(previous)}>
              Voltar etapa
            </MoButton>
          )}
          {next && (
            <MoButton
              variant="primary"
              size="sm"
              disabled={advanceBlockReason !== null}
              onClick={() => onAdvance(next.to)}
              title={advanceBlockReason ?? undefined}
            >
              {next.label}
            </MoButton>
          )}
        </div>
      </div>
    </article>
  );
},
(prev, next) =>
  prev.order === next.order &&
  prev.pending === next.pending &&
  prev.online === next.online &&
  prev.confirming === next.confirming &&
  prev.printFeedback === next.printFeedback &&
  prev.dragging === next.dragging);

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
          <p>{order.delivery.street}, {order.delivery.number ?? 's/n'}{order.delivery.complement ? `, ${order.delivery.complement}` : ''}</p>
          <p>{order.delivery.neighborhood}, {order.delivery.city}/{order.delivery.state}</p>
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
    return (
      <MoBadge variant="positive" className="mt-2">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> Pago
      </MoBadge>
    );
  }
  // Pós-pago só faz sentido confirmar a partir da saída pra entrega (recebe na
  // ponta). PIX pode ser confirmado assim que o dinheiro cai, ainda em Recebidos.
  const confirmavel = order.paymentMethod === 'pix' || order.status === 'in_transit';
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <MoBadge variant="caution">Aguardando pagamento</MoBadge>
        {confirmavel && (
          <MoButton variant="positive" size="sm" disabled={!online} loading={confirming} onClick={onMarkPaid}>
            Marcar pago
          </MoButton>
        )}
      </div>
      {confirmavel && !online && (
        <span className="text-[11px] text-text-muted">Sem conexão com o sistema. Reconecte pra confirmar o pagamento.</span>
      )}
    </div>
  );
}
