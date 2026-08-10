'use client';

import { MapPin, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { CustomerAddress } from '@molho/contracts';
import {
  formatCents,
  MoAddressSheet,
  type MoAddressSheetValue,
  MoButton,
  MoCheckoutReviewSheet,
  MoEmptyState,
  MoOtpSheet,
  MoPixPayment,
  MoStepper,
  MoToast,
} from '@molho/ui';
import { ADDRESS_SCHEMA_VERSION } from '../../../lib/address-storage';
import { lineTotalCents } from '../../../lib/cart-storage';
import type { CheckoutPaymentMethod, CheckoutReview } from '../../../lib/checkout-api';
import { useAddress } from '../../../lib/use-address';
import { useCart } from '../../../lib/use-cart';
import { useCheckout, type CheckoutStep } from '../../../lib/use-checkout';
import { lookupPostalCode } from '../../../lib/viacep';

/**
 * Um branch por `paymentMethod` (Épico 8) — `pix` mostra o QR de verdade;
 * dinheiro/cartão na entrega não têm nada pra o cliente pagar AGORA (o
 * pagamento acontece na porta), então a confirmação é só informativa.
 */
function SuccessPaymentInfo({ step }: { step: Extract<CheckoutStep, { kind: 'success' }> }) {
  if (step.paymentMethod === 'pix') {
    return (
      <>
        <p className="text-body text-text-muted">Falta só o pagamento — a loja começa o preparo assim que confirmar.</p>
        <MoPixPayment payload={step.pix.payload} totalCents={step.totalCents} className="w-full max-w-sm" />
      </>
    );
  }
  if (step.paymentMethod === 'cash_on_delivery') {
    // changeForCents === totalCents é pagamento EXATO (troco zero) — nunca
    // "leve troco pra R$ X" nesse caso, mesma coisa que não pedir troco
    // nenhum pro cliente que for ler a mensagem (validado: sempre
    // changeForCents >= totalCents, InvalidChangeAmountError barra o resto).
    const trocoDeVerdade = step.changeForCents !== null && step.changeForCents > step.totalCents;
    return (
      <p className="text-body text-text-muted">
        Pagamento em dinheiro na entrega — {formatCents(step.totalCents)}
        {trocoDeVerdade ? ` (leve troco pra ${formatCents(step.changeForCents as number)})` : ' (sem troco)'}.
      </p>
    );
  }
  return <p className="text-body text-text-muted">Pagamento no cartão, na entrega — {formatCents(step.totalCents)}. Tenha a maquininha à mão.</p>;
}

export interface CartViewProps {
  slug: string;
  storeName: string;
  /** `GET /v1/store/:slug` (Épico 8, docs/02 §5.5) — array vazio é um estado real: loja sem nenhum método pronto. */
  availablePaymentMethods: CheckoutPaymentMethod[];
  /** `GET /v1/store/:slug` — backend é fonte única do canal de OTP (Épico 9c). */
  otpChannel: 'sms' | 'email';
  emptyTitle: string;
  emptyBody: string;
  emptyActionLabel: string;
}

/**
 * View do carrinho + fluxo de checkout completo (Épico 7). `useCart` é a
 * mesma fonte de verdade do `TenantMenu`: sai de uma página, entra na
 * outra, o carrinho é o mesmo (localStorage, sem Context). `useCheckout`
 * concentra toda a orquestração (revalidação → revisão → OTP → criação) —
 * esta view só liga estado a componente visual.
 */
export function CartView({
  slug,
  storeName,
  availablePaymentMethods,
  otpChannel,
  emptyTitle,
  emptyBody,
  emptyActionLabel,
}: CartViewProps) {
  const cart = useCart(slug);
  const { address, setAddress } = useAddress(slug);
  const checkout = useCheckout(slug, cart.cart, address);
  const router = useRouter();

  const [enderecoSheetAberto, setEnderecoSheetAberto] = React.useState(false);
  const [toastAberto, setToastAberto] = React.useState(false);
  // Identidade do objeto, não conteúdo: cada revalidação nova é um objeto
  // novo (vem de JSON.parse da resposta) — evita reabrir o mesmo toast a
  // cada re-render enquanto o step continuar 'review' com o MESMO resultado.
  const toastMostradoPara = React.useRef<CheckoutReview | null>(null);

  // Pedido criado: esvazia o carrinho — nunca deixa pronto pra reenviar sem
  // querer. Só reage à transição pro estado 'success' (deps: checkout.step.kind
  // de propósito) — reagir a `cart` também disparia de novo a cada render
  // depois do clearCart(), já que `cart` é um valor novo a cada chamada de
  // useCart().
  React.useEffect(() => {
    if (checkout.step.kind === 'success') cart.clearCart();
  }, [checkout.step.kind]);

  // Toast informativo (CLAUDE.md regra 14): preço caiu, nunca exige confirmação.
  React.useEffect(() => {
    if (checkout.step.kind !== 'review' || !checkout.step.review) return;
    const review = checkout.step.review;
    if (toastMostradoPara.current === review) return;
    toastMostradoPara.current = review;
    if (review.hasUnfavorableDivergence) return;
    if (review.items.some((item) => item.priceChanged)) setToastAberto(true);
  }, [checkout.step]);

  if (checkout.step.kind === 'success') {
    return (
      <main className="flex min-h-screen flex-col items-center gap-6 p-6 text-center">
        <h1 className="text-title-lg text-text">Pedido feito! 🎉</h1>
        <SuccessPaymentInfo step={checkout.step} />
        <MoButton variant="ghost" onClick={() => router.push(`/${slug}`)}>
          Voltar pro cardápio
        </MoButton>
      </main>
    );
  }

  // Loja sem NENHUM método de pagamento pronto (Épico 8, docs/02 §5.5) —
  // bloqueia ANTES de deixar montar carrinho nenhum, com mensagem clara.
  // Nunca deixa chegar num botão "Fazer pedido" morto no fim do funil: sem
  // isso o cliente monta o pedido inteiro só pra descobrir, na revisão, que
  // não tem como pagar.
  if (availablePaymentMethods.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <MoEmptyState
          title="Essa loja não está recebendo pedidos agora"
          description="A forma de pagamento ainda não foi configurada. Volta mais tarde ou fala direto com a loja."
          action={{ label: 'Voltar pro cardápio', onClick: () => router.push(`/${slug}`) }}
        />
      </main>
    );
  }

  if (cart.cart.items.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <MoEmptyState
          title={emptyTitle}
          description={emptyBody}
          action={{ label: emptyActionLabel, onClick: () => router.push(`/${slug}`) }}
        />
      </main>
    );
  }

  function salvarEndereco(valor: MoAddressSheetValue) {
    const novoEndereco: CustomerAddress = {
      schemaVersion: ADDRESS_SCHEMA_VERSION,
      ...valor,
      updatedAt: new Date().toISOString(),
    };
    setAddress(novoEndereco);
    setEnderecoSheetAberto(false);
  }

  // CEP + número são o que o checkout exige agora — o servidor deriva o resto.
  const enderecoConfirmado = address !== null && !!address.postalCode && !!address.number;

  return (
    <div className="flex min-h-screen flex-col pb-44">
      <header className="flex flex-col gap-1 bg-brand px-4 py-6 text-on-brand">
        <Link href={`/${slug}`} className="text-caption underline-offset-2 hover:underline">
          ← Voltar pro cardápio
        </Link>
        <h1 className="text-title-lg">Seu carrinho</h1>
        <p className="text-body opacity-90">{storeName}</p>
      </header>

      <button
        type="button"
        onClick={() => setEnderecoSheetAberto(true)}
        className="flex w-full items-center gap-2 border-b border-border px-4 py-3 text-left text-body text-text-muted transition duration-base ease-out hover:bg-bg-card"
      >
        <MapPin className="h-4 w-4 shrink-0 text-brand-strong" aria-hidden="true" />
        <span className="truncate">
          {address ? `${address.label} — ${address.street}, ${address.number ?? 's/n'}` : 'Adicionar endereço de entrega'}
        </span>
      </button>
      {address && !enderecoConfirmado ? (
        <p className="px-4 py-2 text-caption text-critical-strong">
          Falta o CEP e o número deste endereço — completa o formulário pra fazer o pedido.
        </p>
      ) : null}

      <div className="flex flex-1 flex-col divide-y divide-border px-4">
        {cart.cart.items.map((item) => (
          <div key={item.lineId} className="flex flex-col gap-3 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-1 gap-3">
                {/* Mesmo padrão visual do card de produto (rounded-md, bg-brand-faint, ícone de fallback) — ver MoProductCard. */}
                <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md bg-brand-faint">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <UtensilsCrossed className="h-6 w-6 text-brand-strong" aria-hidden="true" />
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-body-strong text-text">{item.name}</span>
                  {item.description ? (
                    <span className="line-clamp-2 text-caption text-text-muted">{item.description}</span>
                  ) : null}
                  {item.modifiers.length > 0 ? (
                    <span className="text-caption text-text-muted">
                      {item.modifiers.map((modificador) => modificador.name).join(', ')}
                    </span>
                  ) : null}
                  {item.notes ? <span className="text-caption text-text-muted">"{item.notes}"</span> : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => cart.removeItem(item.lineId)}
                className="shrink-0 text-caption font-semibold text-critical-strong underline-offset-2 hover:underline"
              >
                Remover
              </button>
            </div>

            <div className="flex items-center justify-between">
              <MoStepper
                value={item.quantity}
                onChange={(quantidade) => cart.updateQuantity(item.lineId, quantidade)}
                min={1}
                label={`Quantidade de ${item.name}`}
              />
              <span className="text-body-strong tnum text-text">{formatCents(lineTotalCents(item))}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 flex flex-col gap-3 border-t border-border bg-bg-card p-4">
        <div className="mx-auto flex w-full max-w-md items-center justify-between text-title text-text">
          <span>Subtotal</span>
          <span className="tnum">{formatCents(cart.subtotalCents)}</span>
        </div>
        <div className="mx-auto w-full max-w-md">
          <MoButton fullWidth disabled={!enderecoConfirmado} onClick={() => void checkout.startCheckout()}>
            Fazer pedido
          </MoButton>
        </div>
      </div>

      <MoAddressSheet
        open={enderecoSheetAberto}
        onOpenChange={setEnderecoSheetAberto}
        initialValue={address}
        onLookupPostalCode={lookupPostalCode}
        onSave={salvarEndereco}
      />

      <MoCheckoutReviewSheet
        open={checkout.step.kind === 'review'}
        onOpenChange={(open) => {
          if (!open) checkout.closeCheckout();
        }}
        review={checkout.step.kind === 'review' ? checkout.step.review : null}
        errorMessage={checkout.step.kind === 'review' ? checkout.step.errorMessage : null}
        confirmLoading={checkout.step.kind === 'review' && checkout.step.submitting}
        onConfirm={checkout.confirmReview}
        availablePaymentMethods={availablePaymentMethods}
        paymentMethod={checkout.paymentMethod}
        onPaymentMethodChange={checkout.setPaymentMethod}
        changeForCents={checkout.changeForCents}
        onChangeForCentsChange={checkout.setChangeForCents}
      />

      <MoOtpSheet
        open={checkout.step.kind === 'otp'}
        onOpenChange={(open) => {
          if (!open) checkout.cancelOtp();
        }}
        channel={otpChannel}
        onRequestCode={checkout.requestOtpCode}
        onVerifyCode={checkout.verifyOtpCode}
        onVerified={() => {}}
      />

      <MoToast
        open={toastAberto}
        onOpenChange={setToastAberto}
        message="Boa notícia: o preço de um item caiu desde que você montou o carrinho."
      />
    </div>
  );
}
