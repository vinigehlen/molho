import type { Cart, CustomerAddress, FulfillmentType } from '@molho/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export type CheckoutPaymentMethod = 'pix' | 'cash_on_delivery' | 'card_on_delivery';
export type { FulfillmentType };

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
    offerId?: string;
    removedChildIds?: string[];
    unitBasePriceCents: number;
    modifiers: { modifierId: string; priceDeltaCents: number }[];
    quantity: number;
    notes: string | null;
  }[];
  fulfillmentType: FulfillmentType;
  /** `null` ⟺ `fulfillmentType === 'pickup'` — retirada não tem endereço de cliente nenhum. */
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
  } | null;
  paymentMethod: CheckoutPaymentMethod;
  /** Só presente (mesmo objeto, `JSON.stringify` derruba `undefined`) quando paymentMethod === 'cash_on_delivery'. */
  changeForCents?: number | null;
  /** Cupom de desconto. Ausente = sem cupom — o servidor sempre revalida (existe/ativo/mínimo/uso). */
  couponCode?: string;
}

export interface CheckoutReviewModifier {
  modifierId: string;
  name: string;
  priceDeltaCents: number;
}

export interface CheckoutReviewItem {
  productId: string;
  offerId: string | null;
  name: string;
  available: boolean;
  unitBasePriceCents: number;
  modifiers: CheckoutReviewModifier[];
  quantity: number;
  notes: string | null;
  lineTotalCents: number;
  priceChanged: boolean;
  comboComponents?: {
    childProductId: string;
    name: string;
    quantity: number;
    removable: boolean;
    removed: boolean;
    unitBasePriceCents?: number;
  }[];
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
  /** Cupom (Épico conversão, C2). `null` = cliente não mandou nenhum. */
  couponCode: string | null;
  /** Só relevante quando `couponCode` não é `null`. */
  couponValid: boolean;
  /** Sempre `0` sem cupom válido. */
  discountCents: number;
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
    typeof v.couponValid === 'boolean' &&
    typeof v.discountCents === 'number' &&
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
type CreatedOrderBase = {
  status: 'created';
  orderId: string;
  trackingToken: string;
  totalCents: number;
  fulfillmentType: FulfillmentType;
  fulfillmentDeadlineAt: string;
};

export type CreateOrderResult =
  | (CreatedOrderBase & { paymentMethod: 'pix'; pix: CheckoutOrderPix })
  | (CreatedOrderBase & { paymentMethod: 'cash_on_delivery'; changeForCents: number | null })
  | (CreatedOrderBase & { paymentMethod: 'card_on_delivery' })
  /** 409 — a revalidação de dentro de `/checkout/orders` achou divergência desfavorável de novo; `review` já é o estado FRESCO, pronto pra mostrar de novo na tela de revisão. */
  | { status: 'divergent'; review: CheckoutReview }
  /** Token expirado/inválido — quem chama deve limpar o token guardado e pedir OTP de novo. */
  | { status: 'unauthorized' }
  | { status: 'error' };

/** `/checkout/orders` — autenticado (accessToken do OTP do cliente). */
/**
 * As DUAS identidades possíveis do pedido, como união — nunca as duas juntas.
 * O servidor rejeita com 400 um request que traga token E bloco `customer`
 * (CLAUDE.md regra 13, EMENDA); modelar como união faz o front não conseguir
 * montar esse request nem por engano.
 */
export type CheckoutIdentity = { accessToken: string } | { guest: { name: string; phone: string } };

const LEGAL_ACCEPTANCE = {
  termsVersion: '2026-08-26',
  privacyVersion: '2026-08-26',
} as const;

export async function createOrder(
  slug: string,
  body: CheckoutRequestBody,
  identity: CheckoutIdentity,
): Promise<CreateOrderResult> {
  const autenticado = 'accessToken' in identity;
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/store/${encodeURIComponent(slug)}/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(autenticado ? { Authorization: `Bearer ${identity.accessToken}` } : {}),
      },
      body: JSON.stringify({
        ...body,
        legalAcceptance: LEGAL_ACCEPTANCE,
        ...(autenticado ? {} : { customer: identity.guest }),
      }),
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
  if (
    typeof d.orderId !== 'string' ||
    typeof d.trackingToken !== 'string' ||
    typeof d.totalCents !== 'number' ||
    (d.fulfillmentType !== 'delivery' && d.fulfillmentType !== 'pickup') ||
    typeof d.fulfillmentDeadlineAt !== 'string'
  ) return null;
  const { orderId, trackingToken, totalCents, fulfillmentType, fulfillmentDeadlineAt } = d as {
    orderId: string;
    trackingToken: string;
    totalCents: number;
    fulfillmentType: FulfillmentType;
    fulfillmentDeadlineAt: string;
  };
  const base = { status: 'created' as const, orderId, trackingToken, totalCents, fulfillmentType, fulfillmentDeadlineAt };

  if (d.paymentMethod === 'pix' && isCheckoutOrderPix(d.pix)) {
    return { ...base, paymentMethod: 'pix', pix: d.pix };
  }
  if (d.paymentMethod === 'cash_on_delivery' && (typeof d.changeForCents === 'number' || d.changeForCents === null)) {
    return { ...base, paymentMethod: 'cash_on_delivery', changeForCents: d.changeForCents };
  }
  if (d.paymentMethod === 'card_on_delivery') {
    return { ...base, paymentMethod: 'card_on_delivery' };
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
/** `address` só é lido em `delivery` — chamador garante não-nulo nesse caso (mesmo padrão de `addressBody`). */
export function buildCheckoutRequestFromCart(
  cart: Cart,
  fulfillmentType: FulfillmentType,
  address: CustomerAddress | null,
  /** Código digitado pelo cliente na revisão. Servidor sempre revalida — nunca confia que existe/vale. */
  couponCode?: string,
): CheckoutRequestBody {
  return {
    items: cart.items.map((item) => ({
      productId: item.productId,
      ...(item.offerId ? { offerId: item.offerId } : {}),
      ...(item.removedChildIds && item.removedChildIds.length > 0 ? { removedChildIds: item.removedChildIds } : {}),
      unitBasePriceCents: item.unitBasePriceCents,
      modifiers: item.modifiers.map((modifier) => ({ modifierId: modifier.id, priceDeltaCents: modifier.priceDeltaCents })),
      quantity: item.quantity,
      notes: item.notes,
    })),
    fulfillmentType,
    address: fulfillmentType === 'pickup' ? null : addressBody(address as CustomerAddress, null),
    paymentMethod: 'pix',
    ...(couponCode ? { couponCode } : {}),
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
  fulfillmentType: FulfillmentType,
  address: CustomerAddress | null,
  paymentMethod: CheckoutPaymentMethod,
  changeForCents: number | null,
): CheckoutRequestBody {
  return {
    items: review.items
      .filter((item) => item.available)
      .map((item) => ({
        productId: item.productId,
        ...(item.offerId ? { offerId: item.offerId } : {}),
        ...(item.comboComponents?.some((component) => component.removed)
          ? { removedChildIds: item.comboComponents.filter((component) => component.removed).map((component) => component.childProductId) }
          : {}),
        unitBasePriceCents: item.unitBasePriceCents,
        modifiers: item.modifiers.map((modifier) => ({ modifierId: modifier.modifierId, priceDeltaCents: modifier.priceDeltaCents })),
        quantity: item.quantity,
        notes: item.notes,
      })),
    fulfillmentType,
    address: fulfillmentType === 'pickup' ? null : addressBody(address as CustomerAddress, review.deliveryFeeCents),
    paymentMethod,
    ...(paymentMethod === 'cash_on_delivery' ? { changeForCents } : {}),
    // Ecoa o cupom que a revalidação já confirmou — nunca reconstrói a partir
    // de um input solto (mesmo racional do resto desta função: sempre parte
    // do que o servidor já validou, nunca do estado bruto do cliente).
    ...(review.couponCode ? { couponCode: review.couponCode } : {}),
  };
}
