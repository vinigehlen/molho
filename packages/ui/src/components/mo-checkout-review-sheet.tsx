'use client';

import { AlertTriangle } from 'lucide-react';
import { formatCents } from '../lib/format';
import { cn } from '../lib/cn';
import { MoButton } from './mo-button';
import { MoSheet } from './mo-sheet';

export interface MoCheckoutReviewModifier {
  modifierId: string;
  name: string;
  priceDeltaCents: number;
}

export interface MoCheckoutReviewItem {
  productId: string;
  name: string;
  /** `false` = sumiu nesta revalidação (esgotado, ou removido do cardápio). */
  available: boolean;
  unitBasePriceCents: number;
  modifiers: MoCheckoutReviewModifier[];
  quantity: number;
  notes: string | null;
  lineTotalCents: number;
  /** Preço mudou desde o que o cliente tinha no carrinho — pra cima OU pra baixo. */
  priceChanged: boolean;
}

export interface MoCheckoutReviewData {
  items: MoCheckoutReviewItem[];
  subtotalCents: number;
  withinZone: boolean;
  deliveryFeeCents: number | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  isOpenNow: boolean;
  nextOpensAt: string | null;
  minOrderCents: number;
  totalCents: number | null;
  /** `true` → regra 14: qualquer coisa que precise de confirmação ativa aconteceu (item sumiu, preço/taxa subiu, fora da zona/horário/mínimo). */
  hasUnfavorableDivergence: boolean;
  canSubmit: boolean;
}

export interface MoCheckoutReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` enquanto a revalidação ainda não voltou do servidor. */
  review: MoCheckoutReviewData | null;
  /** Erro de rede/servidor ao revalidar — sobrepõe a lista de itens. */
  errorMessage?: string | null;
  onConfirm: () => void;
  confirmLoading?: boolean;
  className?: string;
}

/**
 * MoCheckoutReviewSheet — tela de revisão obrigatória do checkout (CLAUDE.md
 * regra 14). Mostra sempre os valores REVALIDADOS do servidor, nunca o que o
 * carrinho tinha antes — item esgotado sai marcado, preço mudado mostra
 * antes→depois. O botão "Confirmar pedido" É o consentimento explícito
 * exigido pela regra: fica desabilitado (`canSubmit: false`) quando não dá
 * pra prosseguir de jeito nenhum (fora da zona/horário/mínimo/tudo indisponível).
 *
 * Preço/taxa CAINDO não é tratado aqui — vira MoToast informativo, fora
 * deste componente (regra 14: nunca exige consentimento pra pagar menos).
 */
export function MoCheckoutReviewSheet({
  open,
  onOpenChange,
  review,
  errorMessage,
  onConfirm,
  confirmLoading = false,
  className,
}: MoCheckoutReviewSheetProps) {
  if (!open) return null;

  const carregando = !errorMessage && review === null;

  return (
    <MoSheet open={open} onOpenChange={onOpenChange} title="Revisa seu pedido" className={className}>
      <div className="flex flex-col gap-4 pb-6">
        {carregando ? <p className="text-body text-text-muted">Conferindo seu pedido…</p> : null}

        {errorMessage ? (
          <div className="flex items-start gap-2 rounded-md bg-critical/10 p-4 text-body text-critical-strong">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {review ? (
          <>
            <ReviewBanners review={review} />

            <div className="flex flex-col divide-y divide-border">
              {review.items.map((item) => (
                <ReviewItemRow key={item.productId} item={item} />
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <div className="flex items-center justify-between text-body text-text">
                <span>Subtotal</span>
                <span className="tnum">{formatCents(review.subtotalCents)}</span>
              </div>
              <div className="flex items-center justify-between text-body text-text">
                <span>Taxa de entrega</span>
                <span className="tnum">{review.deliveryFeeCents !== null ? formatCents(review.deliveryFeeCents) : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-title text-text">
                <span>Total</span>
                <span className="tnum">{review.totalCents !== null ? formatCents(review.totalCents) : '—'}</span>
              </div>
            </div>

            <MoButton disabled={!review.canSubmit} loading={confirmLoading} onClick={onConfirm}>
              Confirmar pedido
            </MoButton>
          </>
        ) : null}
      </div>
    </MoSheet>
  );
}

function ReviewBanners({ review }: { review: MoCheckoutReviewData }) {
  const avisos: string[] = [];
  if (!review.withinZone) avisos.push('Esse endereço está fora da nossa área de entrega.');
  if (review.withinZone && !review.isOpenNow) avisos.push('A loja está fechada agora — não dá pra confirmar o pedido.');
  if (review.subtotalCents < review.minOrderCents) {
    avisos.push(`Falta ${formatCents(review.minOrderCents - review.subtotalCents)} pro pedido mínimo de ${formatCents(review.minOrderCents)}.`);
  }

  if (avisos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {avisos.map((aviso) => (
        <div key={aviso} className="flex items-start gap-2 rounded-md bg-critical/10 p-4 text-body text-critical-strong">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{aviso}</span>
        </div>
      ))}
    </div>
  );
}

function ReviewItemRow({ item }: { item: MoCheckoutReviewItem }) {
  return (
    <div className={cn('flex flex-col gap-1 py-3', !item.available && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className={cn('text-body-strong text-text', !item.available && 'line-through')}>
            {item.quantity}× {item.name}
          </span>
          {item.modifiers.length > 0 ? (
            <span className="text-caption text-text-muted">{item.modifiers.map((m) => m.name).join(', ')}</span>
          ) : null}
          {item.notes ? <span className="text-caption text-text-muted">"{item.notes}"</span> : null}
          {!item.available ? <span className="text-caption font-semibold text-critical-strong">Esgotou — removido do pedido</span> : null}
          {item.available && item.priceChanged ? (
            <span className="text-caption font-semibold text-critical-strong">O preço deste item mudou desde que você montou o carrinho.</span>
          ) : null}
        </div>
        <span className={cn('shrink-0 text-body-strong tnum text-text', !item.available && 'line-through')}>
          {formatCents(item.lineTotalCents)}
        </span>
      </div>
    </div>
  );
}
