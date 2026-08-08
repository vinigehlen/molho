import { act, renderHook, waitFor } from '@testing-library/react';
import type { Cart, CustomerAddress } from '@molho/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADDRESS_SCHEMA_VERSION } from './address-storage';
import { CART_SCHEMA_VERSION } from './cart-storage';
import type * as CheckoutApiModule from './checkout-api';
import type { CheckoutReview } from './checkout-api';
import { useCheckout } from './use-checkout';

const { revalidateCheckout, createOrder } = vi.hoisted(() => ({
  revalidateCheckout: vi.fn(),
  createOrder: vi.fn(),
}));
vi.mock('./checkout-api', async (importOriginal) => {
  const actual = await importOriginal<typeof CheckoutApiModule>();
  return { ...actual, revalidateCheckout, createOrder };
});

const { requestOtp, verifyOtp } = vi.hoisted(() => ({ requestOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock('./customer-auth-api', () => ({ requestOtp, verifyOtp }));

const SLUG = 'hamburgueria-da-vila';

function cart(): Cart {
  return {
    schemaVersion: CART_SCHEMA_VERSION,
    slug: SLUG,
    items: [
      {
        lineId: 'linha-1',
        productId: 'produto-1',
        name: 'X-Burger',
        description: null,
        imageUrl: null,
        unitBasePriceCents: 2890,
        modifiers: [],
        quantity: 1,
        notes: null,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

function address(): CustomerAddress {
  return {
    schemaVersion: ADDRESS_SCHEMA_VERSION,
    label: 'Casa',
    street: 'Rua das Palmeiras',
    number: '120',
    complement: null,
    neighborhood: 'Bela Vista',
    city: 'Estância Velha',
    state: 'RS',
    postalCode: '93610-000',
    referencePoint: null,
    lat: -29.6,
    lng: -51.17,
    updatedAt: new Date().toISOString(),
  };
}

function review(overrides: Partial<CheckoutReview> = {}): CheckoutReview {
  return {
    items: [
      {
        productId: 'produto-1',
        name: 'X-Burger',
        available: true,
        unitBasePriceCents: 2890,
        modifiers: [],
        quantity: 1,
        notes: null,
        lineTotalCents: 2890,
        priceChanged: false,
      },
    ],
    subtotalCents: 2890,
    withinZone: true,
    deliveryFeeCents: 800,
    etaMinMinutes: 30,
    etaMaxMinutes: 50,
    isOpenNow: true,
    nextOpensAt: null,
    minOrderCents: 1000,
    totalCents: 3690,
    hasUnfavorableDivergence: false,
    canSubmit: true,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  revalidateCheckout.mockReset().mockResolvedValue(review());
  createOrder.mockReset();
  requestOtp.mockReset().mockResolvedValue({ ok: true });
  verifyOtp.mockReset().mockResolvedValue({ ok: true, accessToken: 'token-x', customerId: 'customer-1' });
});

afterEach(() => {
  localStorage.clear();
});

describe('useCheckout', () => {
  it('1) startCheckout sem lat/lng no endereço: não faz nada (continua idle)', async () => {
    const { result } = renderHook(() => useCheckout(SLUG, cart(), enderecoSemCep()));
    await act(async () => result.current.startCheckout());
    expect(result.current.step.kind).toBe('idle');
    expect(revalidateCheckout).not.toHaveBeenCalled();
  });

  it('2) startCheckout com endereço completo: revalida e abre a revisão', async () => {
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));

    await act(async () => result.current.startCheckout());

    expect(revalidateCheckout).toHaveBeenCalledWith(SLUG, expect.objectContaining({ items: expect.any(Array) }));
    expect(result.current.step).toMatchObject({ kind: 'review', review: expect.objectContaining({ subtotalCents: 2890 }) });
  });

  it('3) revalidateCheckout devolve null (erro de rede): mostra errorMessage na revisão', async () => {
    revalidateCheckout.mockResolvedValue(null);
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));

    await act(async () => result.current.startCheckout());

    expect(result.current.step).toMatchObject({ kind: 'review', review: null, errorMessage: expect.any(String) });
  });

  it('4) confirmReview sem sessão (sem token): abre o OTP em vez de criar o pedido direto', async () => {
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => result.current.startCheckout());

    act(() => result.current.confirmReview());

    expect(result.current.step.kind).toBe('otp');
    expect(createOrder).not.toHaveBeenCalled();
  });

  const PIX = { payload: '00020101...6304ABCD', key: 'loja@exemplo.com', keyType: 'email' as const };

  it('5) verifyOtpCode ok: guarda o token, cria o pedido, vai pro sucesso (com pix)', async () => {
    createOrder.mockResolvedValue({ status: 'created', orderId: 'order-1', totalCents: 3690, paymentMethod: 'pix', pix: PIX });
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => result.current.startCheckout());
    act(() => result.current.confirmReview());

    await act(async () => {
      await result.current.verifyOtpCode('51999990000', '123456');
    });

    expect(createOrder).toHaveBeenCalledWith(SLUG, expect.any(Object), 'token-x');
    expect(result.current.step).toEqual({ kind: 'success', orderId: 'order-1', totalCents: 3690, paymentMethod: 'pix', pix: PIX });
  });

  it('5b) setPaymentMethod/setChangeForCents (Épico 8): body enviado carrega o método escolhido, step de sucesso reflete cash_on_delivery', async () => {
    createOrder.mockResolvedValue({
      status: 'created',
      orderId: 'order-cash',
      totalCents: 3690,
      paymentMethod: 'cash_on_delivery',
      changeForCents: 5000,
    });
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => result.current.startCheckout());

    act(() => {
      result.current.setPaymentMethod('cash_on_delivery');
      result.current.setChangeForCents(5000);
    });
    act(() => result.current.confirmReview());

    await act(async () => {
      await result.current.verifyOtpCode('51999990000', '123456');
    });

    expect(createOrder).toHaveBeenCalledWith(
      SLUG,
      expect.objectContaining({ paymentMethod: 'cash_on_delivery', changeForCents: 5000 }),
      'token-x',
    );
    expect(result.current.step).toEqual({
      kind: 'success',
      orderId: 'order-cash',
      totalCents: 3690,
      paymentMethod: 'cash_on_delivery',
      changeForCents: 5000,
    });
  });

  it('6) verifyOtpCode falha (código errado): não cria pedido, devolve o erro pro sheet', async () => {
    verifyOtp.mockResolvedValue({ ok: false, message: 'Código inválido ou expirado.' });
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => result.current.startCheckout());
    act(() => result.current.confirmReview());

    let resultado: { ok: boolean } | undefined;
    await act(async () => {
      resultado = await result.current.verifyOtpCode('51999990000', '000000');
    });

    expect(resultado).toEqual({ ok: false, message: 'Código inválido ou expirado.' });
    expect(createOrder).not.toHaveBeenCalled();
    expect(result.current.step.kind).toBe('otp');
  });

  it('7) createOrder devolve divergent (409): volta pra revisão com os dados FRESCOS, não pro OTP', async () => {
    const revisaoFresca = review({ hasUnfavorableDivergence: true, canSubmit: true, subtotalCents: 3500 });
    createOrder.mockResolvedValue({ status: 'divergent', review: revisaoFresca });
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => result.current.startCheckout());
    act(() => result.current.confirmReview());

    await act(async () => {
      await result.current.verifyOtpCode('51999990000', '123456');
    });

    expect(result.current.step).toMatchObject({ kind: 'review', review: expect.objectContaining({ subtotalCents: 3500 }) });
  });

  it('8) createOrder devolve unauthorized: limpa o token e reabre o OTP', async () => {
    createOrder.mockResolvedValue({ status: 'unauthorized' });
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => result.current.startCheckout());
    act(() => result.current.confirmReview());

    await act(async () => {
      await result.current.verifyOtpCode('51999990000', '123456');
    });

    expect(result.current.step.kind).toBe('otp');
  });

  it('9) createOrder devolve error (500/rede): mostra errorMessage, continua na revisão com os dados que já tinha', async () => {
    createOrder.mockResolvedValue({ status: 'error' });
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => result.current.startCheckout());
    act(() => result.current.confirmReview());

    await act(async () => {
      await result.current.verifyOtpCode('51999990000', '123456');
    });

    expect(result.current.step).toMatchObject({ kind: 'review', errorMessage: expect.any(String) });
  });

  it('10) cancelOtp volta pra revisão sem perder o que já tinha sido revalidado', async () => {
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => result.current.startCheckout());
    act(() => result.current.confirmReview());
    expect(result.current.step.kind).toBe('otp');

    act(() => result.current.cancelOtp());

    expect(result.current.step).toMatchObject({ kind: 'review', review: expect.objectContaining({ subtotalCents: 2890 }) });
  });

  it('11) closeCheckout reseta pra idle', async () => {
    const { result } = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => result.current.startCheckout());

    act(() => result.current.closeCheckout());

    expect(result.current.step).toEqual({ kind: 'idle' });
  });

  it('12) sessão já persistida (token salvo de antes): confirmReview cria o pedido direto, sem abrir OTP', async () => {
    createOrder.mockResolvedValue({ status: 'created', orderId: 'order-2', totalCents: 3690, paymentMethod: 'pix', pix: PIX });

    // Primeira montagem: loga e guarda o token.
    const primeira = renderHook(() => useCheckout(SLUG, cart(), address()));
    await act(async () => primeira.result.current.startCheckout());
    act(() => primeira.result.current.confirmReview());
    await act(async () => {
      await primeira.result.current.verifyOtpCode('51999990000', '123456');
    });
    primeira.unmount();

    // Segunda montagem (ex.: reload da página): token ainda válido no localStorage.
    const segunda = renderHook(() => useCheckout(SLUG, cart(), address()));
    await waitFor(() => expect(segunda.result.current).toBeDefined());
    await act(async () => segunda.result.current.startCheckout());
    act(() => segunda.result.current.confirmReview());

    await waitFor(() => expect(segunda.result.current.step.kind).toBe('success'));
    expect(segunda.result.current.step.kind).not.toBe('otp');
  });
});

/** Sem CEP o checkout não pode começar — é o CEP que o servidor geocoda. */
function enderecoSemCep(): CustomerAddress {
  return { ...address(), postalCode: null };
}
