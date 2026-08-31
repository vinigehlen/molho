import { describe, expect, it } from 'vitest';
import {
  CART_MAX_AGE_MS,
  CART_SCHEMA_VERSION,
  type Cart,
  type CartItem,
  cartItemCount,
  cartStorageKey,
  cartSubtotalCents,
  emptyCart,
  lineTotalCents,
  parseStoredCart,
} from './cart';

const PRODUCT_ID = '0193f1a0-0000-7000-8000-000000000001';
const LINE_ID = '0193f1a0-0000-7000-8000-000000000002';
const GROUP_ID = '0193f1a0-0000-7000-8000-000000000003';
const MODIFIER_ID = '0193f1a0-0000-7000-8000-000000000004';

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    lineId: LINE_ID,
    productId: PRODUCT_ID,
    name: 'X-Burger',
    description: null,
    imageUrl: null,
    unitBasePriceCents: 2890,
    modifiers: [],
    quantity: 1,
    notes: null,
    ...overrides,
  };
}

function cart(items: CartItem[], overrides: Partial<Cart> = {}): Cart {
  return { ...emptyCart('hamburgueria-da-vila'), items, ...overrides };
}

describe('cartStorageKey', () => {
  it('namespaceia por slug, para que duas lojas nunca compartilhem carrinho', () => {
    expect(cartStorageKey('hamburgueria-da-vila')).toBe('molho:cart:hamburgueria-da-vila');
    expect(cartStorageKey('pizzaria-roma')).not.toBe(cartStorageKey('hamburgueria-da-vila'));
  });
});

describe('lineTotalCents', () => {
  it('soma os complementos ao preço base antes de multiplicar pela quantidade', () => {
    const total = lineTotalCents(
      item({
        unitBasePriceCents: 2890,
        quantity: 3,
        modifiers: [
          { id: MODIFIER_ID, groupId: GROUP_ID, name: 'Bacon', priceDeltaCents: 400 },
          { id: MODIFIER_ID, groupId: GROUP_ID, name: 'Cheddar extra', priceDeltaCents: 350 },
        ],
      }),
    );
    // (2890 + 400 + 350) * 3
    expect(total).toBe(10_920);
  });

  it('mantém tudo em inteiro, sem centavo fracionado (CLAUDE.md regra 4)', () => {
    const total = lineTotalCents(item({ unitBasePriceCents: 1999, quantity: 3 }));
    expect(total).toBe(5997);
    expect(Number.isInteger(total)).toBe(true);
  });
});

describe('cartSubtotalCents e cartItemCount', () => {
  it('soma as linhas e conta UNIDADES, não linhas', () => {
    const c = cart([
      item({ lineId: LINE_ID, unitBasePriceCents: 2890, quantity: 2 }),
      item({ lineId: GROUP_ID, unitBasePriceCents: 1200, quantity: 3 }),
    ]);
    expect(cartSubtotalCents(c)).toBe(2890 * 2 + 1200 * 3);
    expect(cartItemCount(c)).toBe(5);
  });

  it('carrinho vazio soma zero', () => {
    expect(cartSubtotalCents(emptyCart('x'))).toBe(0);
    expect(cartItemCount(emptyCart('x'))).toBe(0);
  });
});

describe('parseStoredCart', () => {
  const slug = 'hamburgueria-da-vila';

  it('lê de volta um carrinho válido que ele mesmo serializou', () => {
    const original = cart([item({ quantity: 2 })]);
    const restored = parseStoredCart(JSON.stringify(original), slug);
    expect(restored.items).toHaveLength(1);
    expect(cartItemCount(restored)).toBe(2);
  });

  it('preserva offerId novo e aceita item legado sem o campo', () => {
    const offerId = '0193f1a0-0000-7000-8000-000000000005';
    expect(
      parseStoredCart(JSON.stringify(cart([item({ offerId })])), slug).items[0]?.offerId,
    ).toBe(offerId);
    expect(parseStoredCart(JSON.stringify(cart([item()])), slug).items[0]?.offerId).toBeUndefined();
  });

  it('devolve carrinho vazio quando não há nada salvo', () => {
    expect(parseStoredCart(null, slug).items).toEqual([]);
  });

  it('não lança em JSON corrompido — devolve carrinho vazio', () => {
    expect(() => parseStoredCart('{isto não é json', slug)).not.toThrow();
    expect(parseStoredCart('{isto não é json', slug).items).toEqual([]);
  });

  it('descarta carrinho de OUTRA loja, mesmo que íntegro (defesa contra carrinho cruzado)', () => {
    const deOutraLoja = cart([item()], { slug: 'pizzaria-roma' });
    expect(parseStoredCart(JSON.stringify(deOutraLoja), slug).items).toEqual([]);
  });

  it('descarta carrinho gravado em formato antigo, em vez de estourar', () => {
    const formatoAntigo = { ...cart([item()]), schemaVersion: CART_SCHEMA_VERSION - 1 };
    expect(parseStoredCart(JSON.stringify(formatoAntigo), slug).items).toEqual([]);
  });

  it('descarta carrinho mais velho que CART_MAX_AGE_MS', () => {
    const agora = new Date('2026-07-20T12:00:00.000Z');
    const velho = cart([item()], { updatedAt: new Date(agora.getTime() - CART_MAX_AGE_MS - 1).toISOString() });
    expect(parseStoredCart(JSON.stringify(velho), slug, agora).items).toEqual([]);
  });

  it('mantém carrinho que ainda está dentro da janela de idade', () => {
    const agora = new Date('2026-07-20T12:00:00.000Z');
    const recente = cart([item()], { updatedAt: new Date(agora.getTime() - CART_MAX_AGE_MS + 1000).toISOString() });
    expect(parseStoredCart(JSON.stringify(recente), slug, agora).items).toHaveLength(1);
  });

  it('descarta item com quantidade zero ou negativa (payload adulterado à mão)', () => {
    const adulterado = cart([item({ quantity: 0 })]);
    expect(parseStoredCart(JSON.stringify(adulterado), slug).items).toEqual([]);
  });

  it('descarta preço negativo — carrinho nunca é fonte de verdade de dinheiro', () => {
    const adulterado = cart([item({ unitBasePriceCents: -5000 })]);
    expect(parseStoredCart(JSON.stringify(adulterado), slug).items).toEqual([]);
  });
});
