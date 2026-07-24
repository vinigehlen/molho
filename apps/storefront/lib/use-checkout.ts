'use client';

import * as React from 'react';
import type { Cart, CustomerAddress } from '@molho/contracts';
import {
  buildCheckoutRequestFromCart,
  buildCheckoutRequestFromReview,
  createOrder,
  revalidateCheckout,
  type CheckoutReview,
} from './checkout-api';
import { requestOtp, verifyOtp } from './customer-auth-api';
import { useCustomerToken } from './use-customer-token';

export type CheckoutStep =
  | { kind: 'idle' }
  | { kind: 'review'; review: CheckoutReview | null; errorMessage: string | null; submitting: boolean }
  | { kind: 'otp' }
  | { kind: 'success'; orderId: string; totalCents: number };

export interface UseCheckoutResult {
  step: CheckoutStep;
  /** Chamado pelo botão "Fazer pedido" — exige endereço com lat/lng já resolvidos. */
  startCheckout: () => Promise<void>;
  /** Chamado pelo botão "Confirmar pedido" da tela de revisão. */
  confirmReview: () => void;
  requestOtpCode: (phone: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  verifyOtpCode: (phone: string, code: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Fecha a tela de revisão — carrinho/endereço continuam intactos, cliente pode tentar de novo quando quiser. */
  closeCheckout: () => void;
  /** Fecha o sheet de OTP SEM abandonar o checkout — volta pra revisão, que o cliente já viu. */
  cancelOtp: () => void;
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
export function useCheckout(slug: string, cart: Cart, address: CustomerAddress | null): UseCheckoutResult {
  const [step, setStep] = React.useState<CheckoutStep>({ kind: 'idle' });
  const { token, setToken, clearToken } = useCustomerToken(slug);
  const lastReviewRef = React.useRef<CheckoutReview | null>(null);

  const submitOrder = React.useCallback(
    async (accessToken: string) => {
      if (!address || !lastReviewRef.current) return;

      const body = buildCheckoutRequestFromReview(lastReviewRef.current, address);
      const result = await createOrder(slug, body, accessToken);

      if (result.status === 'created') {
        setStep({ kind: 'success', orderId: result.orderId, totalCents: result.totalCents });
        return;
      }
      if (result.status === 'divergent') {
        lastReviewRef.current = result.review;
        setStep({ kind: 'review', review: result.review, errorMessage: null, submitting: false });
        return;
      }
      if (result.status === 'unauthorized') {
        clearToken();
        setStep({ kind: 'otp' });
        return;
      }
      setStep({ kind: 'review', review: lastReviewRef.current, errorMessage: ERRO_CRIACAO, submitting: false });
    },
    [address, clearToken, slug],
  );

  const startCheckout = React.useCallback(async () => {
    if (!address || address.lat === null || address.lng === null) return;

    setStep({ kind: 'review', review: null, errorMessage: null, submitting: false });
    const body = buildCheckoutRequestFromCart(cart, address);
    const review = await revalidateCheckout(slug, body);
    lastReviewRef.current = review;

    setStep(
      review
        ? { kind: 'review', review, errorMessage: null, submitting: false }
        : { kind: 'review', review: null, errorMessage: ERRO_REVALIDACAO, submitting: false },
    );
  }, [address, cart, slug]);

  const confirmReview = React.useCallback(() => {
    if (!lastReviewRef.current) return;

    if (!token) {
      setStep({ kind: 'otp' });
      return;
    }

    setStep((prev) => (prev.kind === 'review' ? { ...prev, submitting: true } : prev));
    void submitOrder(token);
  }, [submitOrder, token]);

  const requestOtpCode = React.useCallback(async (phone: string) => requestOtp(slug, phone), [slug]);

  const verifyOtpCode = React.useCallback(
    async (phone: string, code: string) => {
      const result = await verifyOtp(slug, phone, code);
      if (!result.ok) return result;

      setToken(result.accessToken, result.customerId);
      // Passa o token direto (não lê de volta do hook) — setToken só
      // atualiza o state React na próxima renderização, e submitOrder
      // precisa dele JÁ, sem esperar esse ciclo.
      await submitOrder(result.accessToken);
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

  return { step, startCheckout, confirmReview, requestOtpCode, verifyOtpCode, closeCheckout, cancelOtp };
}
