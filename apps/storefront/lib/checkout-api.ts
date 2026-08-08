import type { Cart, CustomerAddress } from '@molho/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export type CheckoutPaymentMethod = 'pix' | 'cash_on_delivery' | 'card_on_delivery';

/**
 * Espelha `checkoutRequestSchema` (@molho/contracts/checkout.ts) — tipo
 * próprio, sem importar o zod schema em runtime (mesmo racional de
 * `delivery-match-api.ts`: este arquivo é `'use client'`-safe). `revalidate`
 * NUNCA lê `paymentMethod`/`changeForCents` (mesmo DTO dos dois endpoints,
 * ver `checkout.ts`) — só `/orders` usa de verdade.
 */
export interface CheckoutRequestBody {
  items: {
    productId: string;
    unitBasePriceCents: number;
    modifiers: { modifierId: string; priceDeltaCents: number }[];
    quantity: number;
    notes: string | null;
  }[];
  address: {
    label: string;
    /** O servidor deriva cidade/rua/ponto a partir daqui (Épico 6, Bloco 2). */
    postalCode: string;
    number: string;
    complement: string | null;
    /** Fallback de texto: o servidor sobrescreve com o ViaCEP quando ele responde. */
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    referencePoint: string | null;
    expectedDeliveryFeeCents: number | null;
  };
  paymentMethod: CheckoutPaymentMethod;
  /** Só presente (mesmo objeto, `JSON.stringify` derruba `undefined`) quando paymentMethod === 'cash_on_delivery'. */
  changeForCents?: number | null;
}

export interface CheckoutReviewModifier {
  modifierId: string;
  name: string;
  priceDeltaCents: number;
}

export interface CheckoutReviewItem {
  productId: string;
  name: string;
  available: boolean;
  unitBasePriceCents: number;
  modifiers: CheckoutReviewModifier[];
  quantity: number;
  notes: string | null;
  lineTotalCents: number;
  priceChanged: boolean;
}

/** Espelha `revalidatedCheckoutSchema`. */
export interface CheckoutReview {
  items: CheckoutReviewItem[];
  subtotalCents: number;
  withinZone: boolean;
  deliveryFeeCents: number | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  isOpenNow: boolean;
  nextOpensAt: string | null;
  minOrderCents: number;
  totalCents: number | null;
  hasUnfavorableDivergence: boolean;
  canSubmit: boolean;
}

function isCheckoutReview(value: unknown): value is CheckoutReview {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.items) &&
    typeof v.subtotalCents === 'number' &&
    typeof v.withinZone === 'boolean' &&
    typeof v.isOpenNow === 'boolean' &&
    typeof v.hasUnfavorableDivergence === 'boolean' &&
    typeof v.canSubmit === 'boolean'
  );
}

/**
 * `/checkout/revalidate` — público, sem token. Devolve `null` pra qualquer
 * falha (rede, não-200, formato inesperado) — nunca lança, mesmo padrão de
 * `fetchDeliveryMatch`.
 */
export async function revalidateCheckout(slug: string, body: CheckoutRequestBody): Promise<CheckoutReview | null> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/store/${encodeURIComponent(slug)}/checkout/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const data: unknown = await response.json();
  return isCheckoutReview(data) ? data : null;
}

/** Espelha `checkoutOrderPixSchema` (@molho/contracts/checkout.ts). */
export interface CheckoutOrderPix {
  payload: string;
  key: string;
  keyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
}

/** Espelha `checkoutOrderResponseSchema` (união discriminada por paymentMethod, Épico 8). */
export type CreateOrderResult =
  | { status: 'created'; orderId: string; totalCents: number; paymentMethod: 'pix'; pix: CheckoutOrderPix }
  | { status: 'created'; orderId: string; totalCents: number; paymentMethod: 'cash_on_delivery'; changeForCents: number | null }
  | { status: 'created'; orderId: string; totalCents: number; paymentMethod: 'card_on_delivery' }
  /** 409 — a revalidação de dentro de `/checkout/orders` achou divergência desfavorável de novo; `review` já é o estado FRESCO, pronto pra mostrar de novo na tela de revisão. */
  | { status: 'divergent'; review: CheckoutReview }
  /** Token expirado/inválido — quem chama deve limpar o token guardado e pedir OTP de novo. */
  | { status: 'unauthorized' }
  | { status: 'error' };

/** `/checkout/orders` — autenticado (accessToken do OTP do cliente). */
export async function createOrder(slug: string, body: CheckoutRequestBody, accessToken: string): Promise<CreateOrderResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/store/${encodeURIComponent(slug)}/checkout/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { status: 'error' };
  }

  if (response.status === 401) return { status: 'unauthorized' };

  if (response.status === 409) {
    const data: unknown = await response.json().catch(() => null);
    return isCheckoutReview(data) ? { status: 'divergent', review: data } : { status: 'error' };
  }

  if (!response.ok) return { status: 'error' };

  const data: unknown = await response.json().catch(() => null);
  return parseCreatedOrder(data) ?? { status: 'error' };
}

function parseCreatedOrder(data: unknown): CreateOrderResult | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.orderId !== 'string' || typeof d.totalCents !== 'number') return null;
  const { orderId, totalCents } = d;

  if (d.paymentMethod === 'pix' && isCheckoutOrderPix(d.pix)) {
    return { status: 'created', orderId, totalCents, paymentMethod: 'pix', pix: d.pix };
  }
  if (d.paymentMethod === 'cash_on_delivery' && (typeof d.changeForCents === 'number' || d.changeForCents === null)) {
    return { status: 'created', orderId, totalCents, paymentMethod: 'cash_on_delivery', changeForCents: d.changeForCents };
  }
  if (d.paymentMethod === 'card_on_delivery') {
    return { status: 'created', orderId, totalCents, paymentMethod: 'card_on_delivery' };
  }
  return null;
}

function isCheckoutOrderPix(value: unknown): value is CheckoutOrderPix {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.payload === 'string' && typeof v.key === 'string' && typeof v.keyType === 'string';
}

function addressBody(address: CustomerAddress, expectedDeliveryFeeCents: number | null): CheckoutRequestBody['address'] {
  return {
    label: address.label,
    // Chamador garante CEP e número antes de iniciar o checkout
    // (checkoutAddressInputSchema exige os dois).
    postalCode: address.postalCode as string,
    number: address.number as string,
    complement: address.complement,
    street: address.street,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    referencePoint: address.referencePoint,
    expectedDeliveryFeeCents,
  };
}

/**
 * Monta o body da PRIMEIRA revalidação, a partir do carrinho cru do
 * `localStorage`. `expectedDeliveryFeeCents: null` de propósito — o cliente
 * ainda não viu nenhuma taxa confirmada nesta sessão de checkout, então não
 * há o que comparar (ver checkoutAddressInputSchema). `paymentMethod: 'pix'`
 * fixo aqui: o cliente ainda não escolheu nada nesta chamada (o seletor só
 * aparece na tela de revisão, que É o resultado desta revalidação) —
 * `/checkout/revalidate` nunca lê o campo, só existe pro DTO ser o mesmo dos
 * dois endpoints.
 */
export function buildCheckoutRequestFromCart(cart: Cart, address: CustomerAddress): CheckoutRequestBody {
  return {
    items: cart.items.map((item) => ({
      productId: item.productId,
      unitBasePriceCents: item.unitBasePriceCents,
      modifiers: item.modifiers.map((modifier) => ({ modifierId: modifier.id, priceDeltaCents: modifier.priceDeltaCents })),
      quantity: item.quantity,
      notes: item.notes,
    })),
    address: addressBody(address, null),
    paymentMethod: 'pix',
  };
}

/**
 * Monta o body de QUALQUER chamada depois da primeira revalidação — sempre
 * a partir dos valores CONFIRMADOS na última revalidação, nunca do
 * carrinho original. É o que faz a divergência não reaparecer em loop
 * depois que o cliente já viu e confirmou (ver header de
 * @molho/contracts/checkout.ts). Itens indisponíveis são excluídos —
 * confirmar o pedido é confirmar SEM eles. `paymentMethod`/`changeForCents`
 * vêm do seletor da tela de revisão (Épico 8, docs/02 §5.5) — mesmo objeto
 * usado tanto pra revalidar de novo (ignorado lá) quanto pra criar o pedido
 * (lido lá).
 */
export function buildCheckoutRequestFromReview(
  review: CheckoutReview,
  address: CustomerAddress,
  paymentMethod: CheckoutPaymentMethod,
  changeForCents: number | null,
): CheckoutRequestBody {
  return {
    items: review.items
      .filter((item) => item.available)
      .map((item) => ({
        productId: item.productId,
        unitBasePriceCents: item.unitBasePriceCents,
        modifiers: item.modifiers.map((modifier) => ({ modifierId: modifier.modifierId, priceDeltaCents: modifier.priceDeltaCents })),
        quantity: item.quantity,
        notes: item.notes,
      })),
    address: addressBody(address, review.deliveryFeeCents),
    paymentMethod,
    ...(paymentMethod === 'cash_on_delivery' ? { changeForCents } : {}),
  };
}
