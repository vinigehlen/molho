import type { Cart, CustomerAddress } from '@molho/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

/**
 * Espelha `checkoutRequestSchema` (@molho/contracts/checkout.ts) — tipo
 * próprio, sem importar o zod schema em runtime (mesmo racional de
 * `delivery-match-api.ts`: este arquivo é `'use client'`-safe).
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
    street: string;
    number: string | null;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string | null;
    referencePoint: string | null;
    lat: number;
    lng: number;
    expectedDeliveryFeeCents: number | null;
  };
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

export type CreateOrderResult =
  | { status: 'created'; orderId: string; totalCents: number }
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
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (typeof d.orderId === 'string' && typeof d.totalCents === 'number') {
      return { status: 'created', orderId: d.orderId, totalCents: d.totalCents };
    }
  }
  return { status: 'error' };
}

function addressBody(address: CustomerAddress, expectedDeliveryFeeCents: number | null): CheckoutRequestBody['address'] {
  return {
    label: address.label,
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    referencePoint: address.referencePoint,
    // Chamador garante lat/lng não-nulos antes de iniciar o checkout
    // (checkoutAddressInputSchema exige — sem pickup neste épico).
    lat: address.lat as number,
    lng: address.lng as number,
    expectedDeliveryFeeCents,
  };
}

/**
 * Monta o body da PRIMEIRA revalidação, a partir do carrinho cru do
 * `localStorage`. `expectedDeliveryFeeCents: null` de propósito — o cliente
 * ainda não viu nenhuma taxa confirmada nesta sessão de checkout, então não
 * há o que comparar (ver checkoutAddressInputSchema).
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
  };
}

/**
 * Monta o body de QUALQUER chamada depois da primeira revalidação — sempre
 * a partir dos valores CONFIRMADOS na última revalidação, nunca do
 * carrinho original. É o que faz a divergência não reaparecer em loop
 * depois que o cliente já viu e confirmou (ver header de
 * @molho/contracts/checkout.ts). Itens indisponíveis são excluídos —
 * confirmar o pedido é confirmar SEM eles.
 */
export function buildCheckoutRequestFromReview(review: CheckoutReview, address: CustomerAddress): CheckoutRequestBody {
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
  };
}
