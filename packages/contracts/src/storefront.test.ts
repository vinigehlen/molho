import { describe, expect, it } from 'vitest';
import { type StorefrontPayload, guestCustomerSchema, storefrontPayloadSchema, storefrontProductSchema } from './storefront';

const UUID = '0193f1a0-0000-7000-8000-000000000001';

function payload(overrides: Partial<StorefrontPayload> = {}): StorefrontPayload {
  return {
    store: {
      slug: 'hamburgueria-da-vila',
      name: 'Hamburgueria da Vila',
      themeKey: 'brasa',
      timezone: 'America/Sao_Paulo',
      addressText: 'Rua das Palmeiras, 120',
      phone: '+5511999990000',
      whatsappNumber: '+5511999990000',
      minOrderCents: 2000,
      isOpenNow: true,
      nextOpensAt: null,
      availablePaymentMethods: ['pix', 'cash_on_delivery', 'card_on_delivery'],
      reviewsSummary: { average: null, count: 0 },
    },
    categories: [
      {
        id: UUID,
        name: 'Hambúrgueres',
        products: [
          {
            id: UUID,
            offerId: UUID,
            name: 'X-Burger',
            description: 'Pão brioche, blend 180g, queijo e salada.',
            basePriceCents: 2890,
            imageUrl: null,
            images: [],
            available: true,
            modifierGroups: [
              {
                id: UUID,
                name: 'Adicionais',
                min: 0,
                max: 2,
                modifiers: [{ id: UUID, name: 'Bacon', priceDeltaCents: 400 }],
              },
            ],
          },
        ],
      },
    ],
    otpChannel: 'sms',
    guestCheckout: false,
    ...overrides,
  };
}

describe('storefrontPayloadSchema', () => {
  it('aceita um cardápio completo e aninhado', () => {
    expect(storefrontPayloadSchema.safeParse(payload()).success).toBe(true);
  });

  it('aceita loja sem cardápio nenhum (lojista que ainda não cadastrou nada)', () => {
    expect(storefrontPayloadSchema.safeParse(payload({ categories: [] })).success).toBe(true);
  });

  it('aceita themeKey desconhecido — getTheme() resolve no fallback, não quebra a loja', () => {
    const p = payload();
    p.store.themeKey = 'tema-que-ainda-nao-existe';
    expect(storefrontPayloadSchema.safeParse(p).success).toBe(true);
  });

  it('aceita os campos opcionais da loja como null', () => {
    const p = payload();
    p.store.addressText = null;
    p.store.phone = null;
    p.store.whatsappNumber = null;
    expect(storefrontPayloadSchema.safeParse(p).success).toBe(true);
  });

  it('loja fechada: isOpenNow false com nextOpensAt com offset de timezone', () => {
    const p = payload();
    p.store.isOpenNow = false;
    p.store.nextOpensAt = '2026-07-22T12:00:00-03:00';
    expect(storefrontPayloadSchema.safeParse(p).success).toBe(true);
  });

  it('rejeita nextOpensAt sem offset — cliente nunca deveria ter que inferir o fuso da loja', () => {
    const p = payload();
    p.store.isOpenNow = false;
    p.store.nextOpensAt = '2026-07-22T12:00:00';
    expect(storefrontPayloadSchema.safeParse(p).success).toBe(false);
  });

  it('availablePaymentMethods (Épico 8): array vazio é um estado válido — loja sem método pronto', () => {
    const p = payload();
    p.store.availablePaymentMethods = [];
    expect(storefrontPayloadSchema.safeParse(p).success).toBe(true);
  });

  it('availablePaymentMethods: rejeita método desconhecido', () => {
    const p = payload();
    // @ts-expect-error — testando exatamente o valor que o schema tem que rejeitar
    p.store.availablePaymentMethods = ['boleto'];
    expect(storefrontPayloadSchema.safeParse(p).success).toBe(false);
  });
});

describe('storefrontProductSchema — dinheiro', () => {
  function product(overrides: Record<string, unknown> = {}) {
    return {
      id: UUID,
      offerId: UUID,
      name: 'X-Burger',
      description: null,
      basePriceCents: 2890,
      imageUrl: null,
      images: [],
      available: true,
      modifierGroups: [],
      ...overrides,
    };
  }

  it('rejeita preço fracionado — centavos são INTEIROS (CLAUDE.md regra 4)', () => {
    expect(storefrontProductSchema.safeParse(product({ basePriceCents: 28.9 })).success).toBe(false);
  });

  it('rejeita preço negativo', () => {
    expect(storefrontProductSchema.safeParse(product({ basePriceCents: -1 })).success).toBe(false);
  });

  it('rejeita preço como string — "28.90" nunca vira dinheiro por acidente', () => {
    expect(storefrontProductSchema.safeParse(product({ basePriceCents: '2890' })).success).toBe(false);
  });

  it('aceita produto de graça (0 centavos)', () => {
    expect(storefrontProductSchema.safeParse(product({ basePriceCents: 0 })).success).toBe(true);
  });

  it('aceita resposta legada sem offerId durante a expansão 4C', () => {
    const { offerId: _offerId, ...legacy } = product();
    expect(storefrontProductSchema.safeParse(legacy).success).toBe(true);
  });

  it('rejeita imageUrl que não é URL', () => {
    expect(storefrontProductSchema.safeParse(product({ imageUrl: 'produtos/abc.jpg' })).success).toBe(false);
  });
});

describe('guestCustomerSchema', () => {
  it('aceita nome e telefone', () => {
    expect(guestCustomerSchema.safeParse({ name: 'Ana Souza', phone: '51999990000' }).success).toBe(true);
  });

  it('rejeita nome vazio — comanda anônima é justamente o que o guest não pode produzir', () => {
    expect(guestCustomerSchema.safeParse({ name: ' ', phone: '51999990000' }).success).toBe(false);
  });

  it('rejeita campo extra — `.strict()` impede o body de carregar identidade não prevista', () => {
    const extra = { name: 'Ana', phone: '51999990000', email: 'ana@x.com' };
    expect(guestCustomerSchema.safeParse(extra).success).toBe(false);
  });
});
