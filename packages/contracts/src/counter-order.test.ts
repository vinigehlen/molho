import { describe, expect, it } from 'vitest';
import { counterOrderSchema } from './counter-order';

const UNIT_ITEM = { kind: 'unit' as const, productId: '018f3b1a-2b3c-7c4d-8e5f-6a7b8c9d0e1f', quantity: 2 };
const WEIGHED_ITEM = {
  kind: 'weighed' as const,
  productId: '018f3b1a-2b3c-7c4d-8e5f-6a7b8c9d0e20',
  weightGrams: 350,
  lineTotalCents: 4200,
};

describe('counterOrderSchema', () => {
  it('aceita item unit sem preço no body', () => {
    const result = counterOrderSchema.safeParse({ items: [UNIT_ITEM], paymentMethod: 'pix' });
    expect(result.success).toBe(true);
  });

  it('rejeita item unit com preço no body (campo não existe no schema — nunca vem do cliente)', () => {
    const result = counterOrderSchema.safeParse({
      items: [{ ...UNIT_ITEM, lineTotalCents: 999999 }],
      paymentMethod: 'pix',
    });
    expect(result.success).toBe(false);
  });

  it('aceita item weighed com lineTotalCents', () => {
    const result = counterOrderSchema.safeParse({ items: [WEIGHED_ITEM], paymentMethod: 'cash_at_counter' });
    expect(result.success).toBe(true);
  });

  it('rejeita weighed com lineTotalCents <= 0', () => {
    expect(
      counterOrderSchema.safeParse({ items: [{ ...WEIGHED_ITEM, lineTotalCents: 0 }], paymentMethod: 'pix' }).success,
    ).toBe(false);
  });

  it('rejeita quantity <= 0 em unit', () => {
    expect(
      counterOrderSchema.safeParse({ items: [{ ...UNIT_ITEM, quantity: 0 }], paymentMethod: 'pix' }).success,
    ).toBe(false);
  });

  it('rejeita paymentMethod fora do enum de balcão (ex.: cash_on_delivery é de delivery)', () => {
    expect(
      counterOrderSchema.safeParse({ items: [UNIT_ITEM], paymentMethod: 'cash_on_delivery' }).success,
    ).toBe(false);
  });

  it('rejeita items vazio', () => {
    expect(counterOrderSchema.safeParse({ items: [], paymentMethod: 'pix' }).success).toBe(false);
  });

  it('rejeita kind fora de unit|weighed', () => {
    expect(
      counterOrderSchema.safeParse({ items: [{ kind: 'combo', productId: UNIT_ITEM.productId }], paymentMethod: 'pix' })
        .success,
    ).toBe(false);
  });

  it('customerName/notes são opcionais', () => {
    const result = counterOrderSchema.safeParse({ items: [UNIT_ITEM], paymentMethod: 'pix' });
    expect(result.success).toBe(true);
  });

  it('aceita customerName e notes quando mandados', () => {
    const result = counterOrderSchema.safeParse({
      items: [UNIT_ITEM],
      paymentMethod: 'card_at_counter',
      customerName: 'Zé',
      notes: 'sem cebola',
    });
    expect(result.success).toBe(true);
  });
});
