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
  MoStepper,
  MoToast,
} from '@molho/ui';
import { ADDRESS_SCHEMA_VERSION } from '../../../lib/address-storage';
import { lineTotalCents } from '../../../lib/cart-storage';
import type { CheckoutReview } from '../../../lib/checkout-api';
import { useAddress } from '../../../lib/use-address';
import { useCart } from '../../../lib/use-cart';
import { useCheckout } from '../../../lib/use-checkout';

export interface CartViewProps {
  slug: string;
  storeName: string;
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
export function CartView({ slug, storeName, emptyTitle, emptyBody, emptyActionLabel }: CartViewProps) {
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

  if (cart.cart.items.length === 0 && checkout.step.kind !== 'success') {
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

  if (checkout.step.kind === 'success') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-title-lg text-text">Pedido feito! 🎉</h1>
        <p className="text-body text-text-muted">
          Total de {formatCents(checkout.step.totalCents)}. A loja vai confirmar o pagamento e já começar o preparo.
        </p>
        <MoButton onClick={() => router.push(`/${slug}`)}>Voltar pro cardápio</MoButton>
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

  const enderecoConfirmado = address !== null && address.lat !== null && address.lng !== null;

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
          Falta confirmar a localização deste endereço — usa "minha localização" no formulário pra fazer o pedido.
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
      />

      <MoOtpSheet
        open={checkout.step.kind === 'otp'}
        onOpenChange={(open) => {
          if (!open) checkout.cancelOtp();
        }}
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
