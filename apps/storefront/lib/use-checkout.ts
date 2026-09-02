'use client';

import * as React from 'react';
import type { Cart, CustomerAddress } from '@molho/contracts';
import {
  buildCheckoutRequestFromCart,
  buildCheckoutRequestFromReview,
  createOrder,
  revalidateCheckout,
  type CheckoutIdentity,
  type CheckoutOrderPix,
  type CheckoutPaymentMethod,
  type CheckoutReview,
  type FulfillmentType,
} from './checkout-api';
import { requestOtp, verifyOtp } from './customer-auth-api';
import { useCustomerToken } from './use-customer-token';

/** Espelha o branch `status: 'created'` de `CreateOrderResult` (Épico 8) — mesma união por paymentMethod. */
export type CheckoutStep =
  | { kind: 'idle' }
  | { kind: 'review'; review: CheckoutReview | null; errorMessage: string | null; submitting: boolean }
  | { kind: 'otp' }
  /** Sem OTP (`checkout.guest` ligado no tenant): só nome + telefone, e o pedido nasce. */
  | { kind: 'guest' }
  | { kind: 'success'; orderId: string; trackingToken: string; totalCents: number; fulfillmentType: FulfillmentType; fulfillmentDeadlineAt: string; paymentMethod: 'pix'; pix: CheckoutOrderPix }
  | { kind: 'success'; orderId: string; trackingToken: string; totalCents: number; fulfillmentType: FulfillmentType; fulfillmentDeadlineAt: string; paymentMethod: 'cash_on_delivery'; changeForCents: number | null }
  | { kind: 'success'; orderId: string; trackingToken: string; totalCents: number; fulfillmentType: FulfillmentType; fulfillmentDeadlineAt: string; paymentMethod: 'card_on_delivery' };

export interface UseCheckoutResult {
  step: CheckoutStep;
  /** Chamado pelo botão "Fazer pedido" — exige endereço com CEP e número em `delivery`; `pickup` nunca exige endereço. */
  startCheckout: () => Promise<void>;
  /** Chamado pelo botão "Confirmar pedido" da tela de revisão. */
  confirmReview: () => void;
  requestOtpCode: (phone: string, email?: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Finaliza sem OTP — só existe quando o tenant tem `checkout.guest` ligado. */
  submitGuest: (name: string, phone: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  verifyOtpCode: (phone: string, code: string, email?: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Fecha a tela de revisão — carrinho/endereço continuam intactos, cliente pode tentar de novo quando quiser. */
  closeCheckout: () => void;
  /** Fecha o sheet de OTP (ou o de guest) SEM abandonar o checkout — volta pra revisão, que o cliente já viu. */
  cancelOtp: () => void;
  /** Seletor de forma de pagamento da tela de revisão (Épico 8, docs/02 §5.5). */
  paymentMethod: CheckoutPaymentMethod;
  setPaymentMethod: (method: CheckoutPaymentMethod) => void;
  /** Só relevante quando paymentMethod === 'cash_on_delivery'. */
  changeForCents: number | null;
  setChangeForCents: (cents: number | null) => void;
  /** Revalida o carrinho de novo com o código informado — mesma tela de revisão, review atualizado. */
  applyCoupon: (code: string) => Promise<void>;
  couponLoading: boolean;
}

const ERRO_REVALIDACAO = 'Não deu pra conferir seu pedido agora. Tenta de novo.';
const ERRO_CRIACAO = 'Não deu pra confirmar seu pedido agora. Tenta de novo.';

/**
 * Orquestra o fluxo do checkout inteiro (Épico 7): revalidação pública →
 * tela de revisão → OTP só se ainda não tiver sessão → criação do pedido.
 *
 * Regra central, documentada em @molho/contracts/checkout.ts: toda chamada
 * que vem DEPOIS da primeira revalidação usa `buildCheckoutRequestFromReview`
 * — nunca reconstrói a partir do carrinho cru de novo. Sem isso, um cliente
 * que já viu e aceitou uma divergência de preço reenviaria o preço ANTIGO
 * na hora de criar o pedido, e o servidor rejeitaria a mesma divergência
 * pra sempre, em loop.
 */
export function useCheckout(
  slug: string,
  cart: Cart,
  /** `delivery` exige `address` não-nulo; `pickup` ignora `address` inteiramente — retirada não tem endereço de cliente. */
  fulfillmentType: FulfillmentType,
  address: CustomerAddress | null,
  /** Vem do payload público (`guestCheckout`), que é fonte única — o servidor recusa igual se isto mentir. */
  guestCheckout = false,
): UseCheckoutResult {
  const [step, setStep] = React.useState<CheckoutStep>({ kind: 'idle' });
  const { token, setToken, clearToken } = useCustomerToken(slug);
  const lastReviewRef = React.useRef<CheckoutReview | null>(null);
  const [paymentMethod, setPaymentMethod] = React.useState<CheckoutPaymentMethod>('pix');
  const [changeForCents, setChangeForCents] = React.useState<number | null>(null);
  const [couponLoading, setCouponLoading] = React.useState(false);

  const submitOrder = React.useCallback(
    async (identity: CheckoutIdentity) => {
      if (!lastReviewRef.current) return;
      if (fulfillmentType === 'delivery' && !address) return;

      const body = buildCheckoutRequestFromReview(lastReviewRef.current, fulfillmentType, address, paymentMethod, changeForCents);
      const result = await createOrder(slug, body, identity);

      if (result.status === 'created') {
        const { status: _status, ...success } = result;
        setStep({ kind: 'success', ...success });
        return;
      }
      if (result.status === 'divergent') {
        lastReviewRef.current = result.review;
        setStep({ kind: 'review', review: result.review, errorMessage: null, submitting: false });
        return;
      }
      if (result.status === 'unauthorized') {
        // 401 no caminho guest = o lojista desligou o módulo no meio do
        // pedido. Cair no OTP é a saída certa nos dois casos: com token, ele
        // venceu/foi revogado; sem token, agora exige-se identidade provada.
        clearToken();
        setStep({ kind: 'otp' });
        return;
      }
      setStep({ kind: 'review', review: lastReviewRef.current, errorMessage: ERRO_CRIACAO, submitting: false });
    },
    [address, changeForCents, clearToken, fulfillmentType, paymentMethod, slug],
  );

  const startCheckout = React.useCallback(async () => {
    // Pickup nunca exige endereço — retira no balcão, sem CEP/número nenhum.
    if (fulfillmentType === 'delivery' && (!address || !address.postalCode || !address.number)) return;

    setStep({ kind: 'review', review: null, errorMessage: null, submitting: false });
    const body = buildCheckoutRequestFromCart(cart, fulfillmentType, address);
    const review = await revalidateCheckout(slug, body);
    lastReviewRef.current = review;

    setStep(
      review
        ? { kind: 'review', review, errorMessage: null, submitting: false }
        : { kind: 'review', review: null, errorMessage: ERRO_REVALIDACAO, submitting: false },
    );
  }, [address, cart, fulfillmentType, slug]);

  // Reaplica a revalidação com o código de cupom — mesma tela de revisão já
  // aberta, só troca o `review` por baixo. `couponValid`/`discountCents`
  // sempre vêm do servidor (regra 14): nunca confia que um código digitado é
  // válido só porque o cliente apertou "Aplicar".
  const applyCoupon = React.useCallback(
    async (code: string) => {
      if (fulfillmentType === 'delivery' && (!address || !address.postalCode || !address.number)) return;
      setCouponLoading(true);
      try {
        const body = buildCheckoutRequestFromCart(cart, fulfillmentType, address, code);
        const review = await revalidateCheckout(slug, body);
        if (review) {
          lastReviewRef.current = review;
          setStep({ kind: 'review', review, errorMessage: null, submitting: false });
        }
      } finally {
        setCouponLoading(false);
      }
    },
    [address, cart, fulfillmentType, slug],
  );

  const confirmReview = React.useCallback(() => {
    if (!lastReviewRef.current) return;

    if (!token) {
      // Sessão de OTP tem precedência quando existe; sem ela, o tenant decide
      // se pede identidade provada ou declarada.
      setStep({ kind: guestCheckout ? 'guest' : 'otp' });
      return;
    }

    setStep((prev) => (prev.kind === 'review' ? { ...prev, submitting: true } : prev));
    void submitOrder({ accessToken: token });
  }, [guestCheckout, submitOrder, token]);

  const submitGuest = React.useCallback(
    async (name: string, phone: string) => {
      await submitOrder({ guest: { name, phone } });
      // O erro real já virou estado (`step`) dentro de submitOrder — o sheet
      // não duplica mensagem, só para de carregar.
      return { ok: true as const };
    },
    [submitOrder],
  );

  const requestOtpCode = React.useCallback(
    async (phone: string, email?: string) => requestOtp(slug, phone, email),
    [slug],
  );

  const verifyOtpCode = React.useCallback(
    async (phone: string, code: string, email?: string) => {
      const result = await verifyOtp(slug, phone, code, email);
      if (!result.ok) return result;

      setToken(result.accessToken, result.customerId);
      // Passa o token direto (não lê de volta do hook) — setToken só
      // atualiza o state React na próxima renderização, e submitOrder
      // precisa dele JÁ, sem esperar esse ciclo.
      await submitOrder({ accessToken: result.accessToken });
      return { ok: true as const };
    },
    [setToken, slug, submitOrder],
  );

  const closeCheckout = React.useCallback(() => {
    setStep({ kind: 'idle' });
  }, []);

  const cancelOtp = React.useCallback(() => {
    setStep(
      lastReviewRef.current
        ? { kind: 'review', review: lastReviewRef.current, errorMessage: null, submitting: false }
        : { kind: 'idle' },
    );
  }, []);

  return {
    step,
    startCheckout,
    confirmReview,
    requestOtpCode,
    submitGuest,
    verifyOtpCode,
    closeCheckout,
    cancelOtp,
    paymentMethod,
    setPaymentMethod,
    changeForCents,
    setChangeForCents,
    applyCoupon,
    couponLoading,
  };
}
