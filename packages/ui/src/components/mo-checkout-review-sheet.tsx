'use client';

import { AlertTriangle } from 'lucide-react';
import * as React from 'react';
import { formatCents, parseCents } from '../lib/format';
import { cn } from '../lib/cn';
import { MoButton } from './mo-button';
import { MoChip, MoChipGroup } from './mo-chip';
import { MoInput } from './mo-input';
import { MoSheet } from './mo-sheet';

/** Espelha `PaymentMethod` de `@molho/contracts/checkout.ts` — repetido aqui (não importado) porque `packages/ui` não depende de `packages/contracts` (design system é agnóstico de domínio de negócio). */
export type MoPaymentMethod = 'pix' | 'cash_on_delivery' | 'card_on_delivery';

const PAYMENT_METHOD_LABELS: Record<MoPaymentMethod, string> = {
  pix: 'Pix',
  cash_on_delivery: 'Dinheiro na entrega',
  card_on_delivery: 'Cartão na entrega',
};

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
  /**
   * Métodos que a LOJA pode aceitar agora (`GET /v1/store/:slug`, Épico 8,
   * docs/02 §5.5) — o seletor só oferece o que vem aqui, nunca a lista fixa
   * dos 3. Gate no service continua existindo (defesa em profundidade,
   * corpo forjável), mas isto é o que evita o cliente escolher algo que vai
   * estourar erro só no fim do funil.
   */
  availablePaymentMethods: MoPaymentMethod[];
  /** Método de pagamento escolhido (Épico 8) — sem seletor, o storefront nunca exercitaria dinheiro/cartão na entrega, e o módulo `payments.on_delivery` ficaria morto (docs/02 §5.5). */
  paymentMethod: MoPaymentMethod;
  onPaymentMethodChange: (method: MoPaymentMethod) => void;
  /** Só relevante quando `paymentMethod === 'cash_on_delivery'` — "troco pra quanto", não o troco em si. `null` = não precisa. */
  changeForCents: number | null;
  onChangeForCentsChange: (cents: number | null) => void;
  legalAccepted?: boolean;
  onLegalAcceptedChange?: (accepted: boolean) => void;
  termsHref?: string;
  privacyHref?: string;
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
  availablePaymentMethods,
  paymentMethod,
  onPaymentMethodChange,
  changeForCents,
  onChangeForCentsChange,
  legalAccepted = true,
  onLegalAcceptedChange,
  termsHref = '/termos',
  privacyHref = '/privacidade',
}: MoCheckoutReviewSheetProps) {
  // Corrige o método selecionado sempre que a lista de disponíveis não bate
  // com ele — sozinho se sobrar só 1 (pré-seleção), ou se o método atual
  // (ex.: default 'pix' do consumidor) nem estiver na lista que a loja
  // aceita de verdade. Roda de novo se `availablePaymentMethods` mudar
  // (chegada tardia do fetch) ou se `paymentMethod` for corrigido por fora.
  React.useEffect(() => {
    if (availablePaymentMethods.length === 0) return;
    if (availablePaymentMethods.includes(paymentMethod)) return;
    onPaymentMethodChange(availablePaymentMethods[0] as MoPaymentMethod);
  }, [availablePaymentMethods, onPaymentMethodChange, paymentMethod]);

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

            <PaymentMethodPicker
              availablePaymentMethods={availablePaymentMethods}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={onPaymentMethodChange}
              changeForCents={changeForCents}
              onChangeForCentsChange={onChangeForCentsChange}
              totalCents={review.totalCents}
            />

            <MoButton
              disabled={!review.canSubmit || availablePaymentMethods.length === 0 || !legalAccepted}
              loading={confirmLoading}
              onClick={onConfirm}
            >
              Confirmar pedido
            </MoButton>

            <label className="flex items-start gap-2 rounded-md border border-border bg-bg-card p-3 text-caption text-text-muted">
              <input
                type="checkbox"
                checked={legalAccepted}
                onChange={(event) => onLegalAcceptedChange?.(event.currentTarget.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-border"
              />
              <span>
                Li e aceito os{' '}
                <a href={termsHref} target="_blank" rel="noreferrer" className="font-semibold text-brand-strong underline-offset-2 hover:underline">
                  termos de uso
                </a>{' '}
                e a{' '}
                <a href={privacyHref} target="_blank" rel="noreferrer" className="font-semibold text-brand-strong underline-offset-2 hover:underline">
                  política de privacidade
                </a>
                .
              </span>
            </label>
          </>
        ) : null}
      </div>
    </MoSheet>
  );
}

function PaymentMethodPicker({
  availablePaymentMethods,
  paymentMethod,
  onPaymentMethodChange,
  changeForCents,
  onChangeForCentsChange,
  totalCents,
}: {
  availablePaymentMethods: MoPaymentMethod[];
  paymentMethod: MoPaymentMethod;
  onPaymentMethodChange: (method: MoPaymentMethod) => void;
  changeForCents: number | null;
  onChangeForCentsChange: (cents: number | null) => void;
  totalCents: number | null;
}) {
  const naoPrecisaDeTroco = changeForCents === null;
  // Total ainda pode ser null (fora de zona/etc.) — o campo de troco não faz
  // sentido sem um valor pra comparar, então some junto com o resto bloqueado.
  const trocoMenorQueTotal = changeForCents !== null && totalCents !== null && changeForCents < totalCents;

  /**
   * `changeForCents` é sempre limpo AQUI, no instante da troca de método —
   * não confia em `MoInput` (não-controlado, `defaultValue` só lê no mount)
   * pra descartar o valor digitado sozinho, nem depende do consumidor
   * lembrar de resetar. Sem isso: cash_on_delivery com troco digitado →
   * troca pra cartão → volta pra dinheiro, e o valor antigo reaparece (o
   * estado nunca foi limpo, só o campo tinha sumido da tela por um instante).
   */
  function selecionarMetodo(method: MoPaymentMethod) {
    if (method !== 'cash_on_delivery') onChangeForCentsChange(null);
    onPaymentMethodChange(method);
  }

  if (availablePaymentMethods.length === 0) {
    // Defensivo: o fluxo normal já bloqueia o checkout inteiro ANTES de
    // chegar aqui (loja sem nenhum método pronto), mas se algum consumidor
    // abrir a sheet mesmo assim, nunca deixa escolher um método fantasma.
    return (
      <div className="flex items-start gap-2 rounded-md bg-critical/10 p-4 text-body text-critical-strong">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>Essa loja não tem nenhuma forma de pagamento configurada agora.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <span className="text-body-strong text-text">Forma de pagamento</span>
      <MoChipGroup label="Forma de pagamento">
        {availablePaymentMethods.map((method) => (
          <MoChip key={method} selected={paymentMethod === method} onClick={() => selecionarMetodo(method)}>
            {PAYMENT_METHOD_LABELS[method]}
          </MoChip>
        ))}
      </MoChipGroup>

      {paymentMethod === 'cash_on_delivery' ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-body text-text">
            <input
              type="checkbox"
              checked={naoPrecisaDeTroco}
              onChange={(e) => onChangeForCentsChange(e.currentTarget.checked ? null : 0)}
              className="h-5 w-5 rounded-sm border-border"
            />
            Não preciso de troco
          </label>
          {!naoPrecisaDeTroco ? (
            <MoInput
              // Não-controlado de propósito (defaultValue, não value): a
              // máscara de moeda já reconstrói o valor mascarado a cada
              // keystroke internamente (MoInput.handleChange) — amarrar num
              // `value` controlado reintroduz esse texto formatado no DOM
              // ANTES do próximo keystroke do usuário chegar, e os dois
              // dígitos brigam (mesmo padrão comprovado em mo-input.test.tsx,
              // que também não controla o campo de moeda). Seguro contra
              // valor fantasma porque `selecionarMetodo` já limpou o estado
              // ANTES deste componente sequer desmontar — remonta sempre com
              // `defaultValue` correto (vazio), nunca com sobra de sessão
              // anterior.
              label="Troco pra quanto?"
              mask="currency"
              inputMode="numeric"
              defaultValue={changeForCents ? formatCents(changeForCents) : ''}
              onChange={(e) => onChangeForCentsChange(parseCents(e.currentTarget.value))}
              error={trocoMenorQueTotal ? 'Esse valor é menor que o total do pedido.' : undefined}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReviewBanners({ review }: { review: MoCheckoutReviewData }) {
  const avisos: string[] = [];
  if (!review.withinZone) avisos.push('Esse endereço está fora da nossa área de entrega.');
  if (review.withinZone && !review.isOpenNow) avisos.push('A loja está fechada agora, não dá pra confirmar o pedido.');
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
          {!item.available ? <span className="text-caption font-semibold text-critical-strong">Esgotou, removido do pedido</span> : null}
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
