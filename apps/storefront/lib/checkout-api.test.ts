import type { Cart, CustomerAddress } from '@molho/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADDRESS_SCHEMA_VERSION } from './address-storage';
import { CART_SCHEMA_VERSION } from './cart-storage';
import {
  buildCheckoutRequestFromCart,
  buildCheckoutRequestFromReview,
  createOrder,
  revalidateCheckout,
  type CheckoutReview,
} from './checkout-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    schemaVersion: CART_SCHEMA_VERSION,
    slug: 'hamburgueria-da-vila',
    items: [
      {
        lineId: '0193f1a0-0000-7000-8000-000000000001',
        productId: '0193f1a0-0000-7000-8000-000000000002',
        name: 'X-Burger',
        description: null,
        imageUrl: null,
        unitBasePriceCents: 2890,
        modifiers: [
          { id: '0193f1a0-0000-7000-8000-0000000000a1', groupId: '0193f1a0-0000-7000-8000-0000000000a0', name: 'Bacon', priceDeltaCents: 400 },
        ],
        quantity: 2,
        notes: 'sem cebola',
      },
    ],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function address(overrides: Partial<CustomerAddress> = {}): CustomerAddress {
  return {
    schemaVersion: ADDRESS_SCHEMA_VERSION,
    label: 'Casa',
    street: 'Rua das Palmeiras',
    number: '120',
    complement: null,
    neighborhood: 'Bela Vista',
    city: 'Estância Velha',
    state: 'RS',
    postalCode: null,
    referencePoint: null,
    lat: -29.6,
    lng: -51.17,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function review(overrides: Partial<CheckoutReview> = {}): CheckoutReview {
  return {
    items: [
      {
        productId: '0193f1a0-0000-7000-8000-000000000002',
        name: 'X-Burger',
        available: true,
        unitBasePriceCents: 2890,
        modifiers: [{ modifierId: '0193f1a0-0000-7000-8000-0000000000a1', name: 'Bacon', priceDeltaCents: 400 }],
        quantity: 2,
        notes: 'sem cebola',
        lineTotalCents: 6580,
        priceChanged: false,
      },
    ],
    subtotalCents: 6580,
    withinZone: true,
    deliveryFeeCents: 800,
    etaMinMinutes: 30,
    etaMaxMinutes: 50,
    isOpenNow: true,
    nextOpensAt: null,
    minOrderCents: 2000,
    totalCents: 7380,
    hasUnfavorableDivergence: false,
    canSubmit: true,
    ...overrides,
  };
}

describe('buildCheckoutRequestFromCart', () => {
  it('monta o body a partir do carrinho, com expectedDeliveryFeeCents null (primeira revalidação)', () => {
    const body = buildCheckoutRequestFromCart(cart(), address());

    expect(body.items).toEqual([
      {
        productId: '0193f1a0-0000-7000-8000-000000000002',
        unitBasePriceCents: 2890,
        modifiers: [{ modifierId: '0193f1a0-0000-7000-8000-0000000000a1', priceDeltaCents: 400 }],
        quantity: 2,
        notes: 'sem cebola',
      },
    ]);
    expect(body.address).toMatchObject({ street: 'Rua das Palmeiras', lat: -29.6, lng: -51.17, expectedDeliveryFeeCents: null });
  });
});

describe('buildCheckoutRequestFromReview', () => {
  it('monta o body a partir da revalidação — nunca do carrinho — e usa a taxa revalidada como esperada', () => {
    const body = buildCheckoutRequestFromReview(review(), address());

    expect(body.items).toEqual([
      {
        productId: '0193f1a0-0000-7000-8000-000000000002',
        unitBasePriceCents: 2890,
        modifiers: [{ modifierId: '0193f1a0-0000-7000-8000-0000000000a1', priceDeltaCents: 400 }],
        quantity: 2,
        notes: 'sem cebola',
      },
    ]);
    expect(body.address.expectedDeliveryFeeCents).toBe(800);
  });

  it('exclui itens indisponíveis — confirmar o pedido é confirmar SEM eles', () => {
    const comItemEsgotado = review({
      items: [
        ...review().items,
        {
          productId: 'produto-esgotado',
          name: 'X-Bacon',
          available: false,
          unitBasePriceCents: 3200,
          modifiers: [],
          quantity: 1,
          notes: null,
          lineTotalCents: 0,
          priceChanged: false,
        },
      ],
    });

    const body = buildCheckoutRequestFromReview(comItemEsgotado, address());

    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.productId).toBe('0193f1a0-0000-7000-8000-000000000002');
  });
});

describe('revalidateCheckout', () => {
  it('resposta 200: devolve a revalidação tipada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => review() })));

    const resultado = await revalidateCheckout('hamburgueria-da-vila', buildCheckoutRequestFromCart(cart(), address()));
    expect(resultado?.subtotalCents).toBe(6580);
  });

  it('resposta não-200: devolve null, nunca lança', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await revalidateCheckout('x', buildCheckoutRequestFromCart(cart(), address()))).toBeNull();
  });

  it('erro de rede: devolve null, nunca lança', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(revalidateCheckout('x', buildCheckoutRequestFromCart(cart(), address()))).resolves.toBeNull();
  });

  it('payload em formato inesperado: devolve null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ algumaCoisa: true }) })));
    expect(await revalidateCheckout('x', buildCheckoutRequestFromCart(cart(), address()))).toBeNull();
  });
});

describe('createOrder', () => {
  const body = buildCheckoutRequestFromReview(review(), address());

  it('201: devolve status created com orderId/totalCents', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ orderId: 'order-1', status: 'received', paymentStatus: 'aguardando_confirmacao', totalCents: 7380 }),
      })),
    );

    const resultado = await createOrder('hamburgueria-da-vila', body, 'token-x');
    expect(resultado).toEqual({ status: 'created', orderId: 'order-1', totalCents: 7380 });
  });

  it('401: devolve status unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    expect(await createOrder('x', body, 'token-x')).toEqual({ status: 'unauthorized' });
  });

  it('409: devolve status divergent com a revalidação fresca', async () => {
    const revalidacaoFresca = review({ hasUnfavorableDivergence: true, canSubmit: false });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => revalidacaoFresca })));

    const resultado = await createOrder('x', body, 'token-x');
    expect(resultado.status).toBe('divergent');
    if (resultado.status === 'divergent') expect(resultado.review.hasUnfavorableDivergence).toBe(true);
  });

  it('erro de rede: devolve status error, nunca lança', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await createOrder('x', body, 'token-x')).toEqual({ status: 'error' });
  });

  it('500: devolve status error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    expect(await createOrder('x', body, 'token-x')).toEqual({ status: 'error' });
  });
});
