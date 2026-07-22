import { describe, expect, it } from 'vitest';
import {
  checkoutAddressInputSchema,
  checkoutOrderResponseSchema,
  checkoutRequestSchema,
  revalidatedCheckoutSchema,
} from './checkout';

const UUID = '0193f1a0-0000-7000-8000-000000000001';

function address(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    ...overrides,
  };
}

describe('checkoutAddressInputSchema', () => {
  it('exige lat/lng — diferente do endereço de navegação (Épico 6), aqui não é opcional', () => {
    expect(checkoutAddressInputSchema.safeParse(address()).success).toBe(true);
    expect(checkoutAddressInputSchema.safeParse(address({ lat: null })).success).toBe(false);
    expect(checkoutAddressInputSchema.safeParse(address({ lng: null })).success).toBe(false);
  });
});

describe('checkoutRequestSchema', () => {
  it('exige pelo menos 1 item — carrinho vazio não faz checkout', () => {
    const semItens = { items: [], address: address() };
    expect(checkoutRequestSchema.safeParse(semItens).success).toBe(false);
  });

  it('aceita carrinho com item e endereço válidos', () => {
    const valido = {
      items: [{ productId: UUID, modifierIds: [], quantity: 1, notes: null }],
      address: address(),
    };
    expect(checkoutRequestSchema.safeParse(valido).success).toBe(true);
  });
});

describe('revalidatedCheckoutSchema', () => {
  function payload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      items: [
        {
          productId: UUID,
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
      minOrderCents: 3000,
      totalCents: 3690,
      hasUnfavorableDivergence: false,
      canSubmit: true,
      ...overrides,
    };
  }

  it('aceita o caminho feliz: dentro da zona, aberta, sem divergência', () => {
    expect(revalidatedCheckoutSchema.safeParse(payload()).success).toBe(true);
  });

  it('fora da zona: deliveryFeeCents/etaMin/etaMax/totalCents nulos, canSubmit false', () => {
    const foraDaZona = payload({
      withinZone: false,
      deliveryFeeCents: null,
      etaMinMinutes: null,
      etaMaxMinutes: null,
      totalCents: null,
      canSubmit: false,
    });
    expect(revalidatedCheckoutSchema.safeParse(foraDaZona).success).toBe(true);
  });

  it('rejeita totalCents fracionado — dinheiro é inteiro (CLAUDE.md regra 4)', () => {
    const invalido = payload({ totalCents: 36.9 });
    expect(revalidatedCheckoutSchema.safeParse(invalido).success).toBe(false);
  });
});

describe('checkoutOrderResponseSchema', () => {
  it('aceita a resposta de criação — pedido nasce direto em received/aguardando_confirmacao (PIX estático)', () => {
    const resposta = { orderId: UUID, status: 'received', paymentStatus: 'aguardando_confirmacao', totalCents: 3690 };
    expect(checkoutOrderResponseSchema.safeParse(resposta).success).toBe(true);
  });

  it('rejeita qualquer outro status na criação — só received é alcançável no MVP', () => {
    const invalido = { orderId: UUID, status: 'pending_payment', paymentStatus: 'aguardando_confirmacao', totalCents: 3690 };
    expect(checkoutOrderResponseSchema.safeParse(invalido).success).toBe(false);
  });
});
