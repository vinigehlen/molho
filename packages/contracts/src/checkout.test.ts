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
    postalCode: '93610-000',
    referencePoint: null,
    expectedDeliveryFeeCents: 800,
    ...overrides,
  };
}

describe('checkoutAddressInputSchema', () => {
  it('exige CEP e número; NÃO aceita lat/lng do cliente (Épico 6, Bloco 2)', () => {
    expect(checkoutAddressInputSchema.safeParse(address()).success).toBe(true);
    expect(checkoutAddressInputSchema.safeParse(address({ postalCode: '9360' })).success).toBe(false);
    expect(checkoutAddressInputSchema.safeParse(address({ number: '' })).success).toBe(false);
    // Rua/bairro/cidade/UF vazios são o caso NORMAL: o ViaCEP no servidor
    // sobrescreve os quatro. Exigir não-vazio rejeitaria o caminho feliz.
    expect(checkoutAddressInputSchema.safeParse(address({ street: '', city: '' })).success).toBe(true);
  });
});

const ITEM = { productId: UUID, unitBasePriceCents: 2890, modifiers: [], quantity: 1, notes: null };

describe('checkoutRequestSchema', () => {
  it('exige pelo menos 1 item — carrinho vazio não faz checkout', () => {
    const semItens = { items: [], fulfillmentType: 'delivery', address: address(), paymentMethod: 'pix' };
    expect(checkoutRequestSchema.safeParse(semItens).success).toBe(false);
  });

  it('aceita carrinho com item e endereço válidos, método pix (sem changeForCents)', () => {
    const valido = { items: [ITEM], fulfillmentType: 'delivery', address: address(), paymentMethod: 'pix' };
    expect(checkoutRequestSchema.safeParse(valido).success).toBe(true);
  });

  it('aceita carrinho com item e endereço válidos, método card_on_delivery', () => {
    const valido = { items: [ITEM], fulfillmentType: 'delivery', address: address(), paymentMethod: 'card_on_delivery' };
    expect(checkoutRequestSchema.safeParse(valido).success).toBe(true);
  });

  it('cash_on_delivery exige changeForCents (mesmo que null) — não é campo solto opcional', () => {
    const semCampo = { items: [ITEM], fulfillmentType: 'delivery', address: address(), paymentMethod: 'cash_on_delivery' };
    expect(checkoutRequestSchema.safeParse(semCampo).success).toBe(false);

    const semTroco = { items: [ITEM], fulfillmentType: 'delivery', address: address(), paymentMethod: 'cash_on_delivery', changeForCents: null };
    expect(checkoutRequestSchema.safeParse(semTroco).success).toBe(true);

    const comTroco = { items: [ITEM], fulfillmentType: 'delivery', address: address(), paymentMethod: 'cash_on_delivery', changeForCents: 5000 };
    expect(checkoutRequestSchema.safeParse(comTroco).success).toBe(true);
  });

  it('changeForCents em branch errado (pix/card_on_delivery) é rejeitado — campo não existe fora de cash_on_delivery', () => {
    const pixComTroco = { items: [ITEM], fulfillmentType: 'delivery', address: address(), paymentMethod: 'pix', changeForCents: 5000 };
    expect(checkoutRequestSchema.safeParse(pixComTroco).success).toBe(false);
  });

  it('retirada no balcão (docs/03, docs/04): pickup sem endereço passa, delivery sem endereço não', () => {
    const pickup = { items: [ITEM], fulfillmentType: 'pickup', address: null, paymentMethod: 'pix' };
    expect(checkoutRequestSchema.safeParse(pickup).success).toBe(true);

    const deliverySemEndereco = { items: [ITEM], fulfillmentType: 'delivery', address: null, paymentMethod: 'pix' };
    expect(checkoutRequestSchema.safeParse(deliverySemEndereco).success).toBe(false);
  });

  it('pickup COM endereço é rejeitado — nunca ignora em silêncio um endereço que o servidor não vai olhar', () => {
    const pickupComEndereco = { items: [ITEM], fulfillmentType: 'pickup', address: address(), paymentMethod: 'pix' };
    expect(checkoutRequestSchema.safeParse(pickupComEndereco).success).toBe(false);
  });
});

describe('revalidatedCheckoutSchema', () => {
  function payload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      items: [
        {
          productId: UUID,
          offerId: UUID,
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
      couponCode: null,
      couponValid: false,
      discountCents: 0,
      scheduledFor: null,
      scheduledForValid: false,
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

const PIX_RESPONSE = { payload: '00020101...6304ABCD', key: 'loja@exemplo.com', keyType: 'email' as const };
const RESPONSE_BASE = {
  orderId: UUID,
  status: 'received' as const,
  paymentStatus: 'aguardando_confirmacao' as const,
  totalCents: 3690,
  discountCents: 0,
  couponCode: null,
  cashbackUsedCents: 0,
  scheduledFor: null,
  fulfillmentType: 'delivery' as const,
  fulfillmentDeadlineAt: '2026-08-14T19:50:00.000Z',
};

describe('checkoutOrderResponseSchema', () => {
  it('pix: aceita com o campo pix (QR/copia-e-cola)', () => {
    const resposta = { ...RESPONSE_BASE, paymentMethod: 'pix', pix: PIX_RESPONSE };
    expect(checkoutOrderResponseSchema.safeParse(resposta).success).toBe(true);
  });

  it('pix: rejeita sem o campo pix — Épico 8, sempre precisa do QR pro cliente pagar', () => {
    const semPix = { ...RESPONSE_BASE, paymentMethod: 'pix' };
    expect(checkoutOrderResponseSchema.safeParse(semPix).success).toBe(false);
  });

  it('cash_on_delivery: aceita com changeForCents (número ou null), rejeita com pix', () => {
    expect(checkoutOrderResponseSchema.safeParse({ ...RESPONSE_BASE, paymentMethod: 'cash_on_delivery', changeForCents: 5000 }).success).toBe(true);
    expect(checkoutOrderResponseSchema.safeParse({ ...RESPONSE_BASE, paymentMethod: 'cash_on_delivery', changeForCents: null }).success).toBe(true);
    expect(
      checkoutOrderResponseSchema.safeParse({ ...RESPONSE_BASE, paymentMethod: 'cash_on_delivery', changeForCents: 5000, pix: PIX_RESPONSE })
        .success,
    ).toBe(false);
  });

  it('card_on_delivery: aceita só com os campos base, rejeita pix/changeForCents', () => {
    expect(checkoutOrderResponseSchema.safeParse({ ...RESPONSE_BASE, paymentMethod: 'card_on_delivery' }).success).toBe(true);
    expect(checkoutOrderResponseSchema.safeParse({ ...RESPONSE_BASE, paymentMethod: 'card_on_delivery', changeForCents: 100 }).success).toBe(
      false,
    );
  });

  it('rejeita qualquer outro status na criação — só received é alcançável no MVP', () => {
    const invalido = { ...RESPONSE_BASE, status: 'pending_payment', paymentMethod: 'pix', pix: PIX_RESPONSE };
    expect(checkoutOrderResponseSchema.safeParse(invalido).success).toBe(false);
  });
});
