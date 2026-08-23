import { describe, expect, it } from 'vitest';
import { createCouponSchema, updateCouponSchema } from './coupon-admin';

function base(overrides: Record<string, unknown> = {}) {
  return {
    code: 'PROMO10',
    discountType: 'percent',
    discountPercent: 10,
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2026-09-30T23:59:59.000Z',
    maxUses: 100,
    ...overrides,
  };
}

describe('createCouponSchema', () => {
  it('aceita percent com discountPercent', () => {
    expect(createCouponSchema.safeParse(base()).success).toBe(true);
  });

  it('aceita fixed com discountValueCents', () => {
    const input = base({ discountType: 'fixed', discountPercent: undefined, discountValueCents: 500 });
    expect(createCouponSchema.safeParse(input).success).toBe(true);
  });

  it('rejeita percent sem discountPercent', () => {
    expect(createCouponSchema.safeParse(base({ discountPercent: undefined })).success).toBe(false);
  });

  it('rejeita fixed com discountPercent setado (XOR)', () => {
    const input = base({ discountType: 'fixed', discountValueCents: 500 });
    expect(createCouponSchema.safeParse(input).success).toBe(false);
  });

  it('rejeita discountPercent fora de 1-100', () => {
    expect(createCouponSchema.safeParse(base({ discountPercent: 0 })).success).toBe(false);
    expect(createCouponSchema.safeParse(base({ discountPercent: 101 })).success).toBe(false);
  });

  it('rejeita discountValueCents <= 0', () => {
    const input = base({ discountType: 'fixed', discountPercent: undefined, discountValueCents: 0 });
    expect(createCouponSchema.safeParse(input).success).toBe(false);
  });

  it('rejeita startsAt >= endsAt', () => {
    const input = base({ startsAt: '2026-09-30T23:59:59.000Z', endsAt: '2026-09-01T00:00:00.000Z' });
    expect(createCouponSchema.safeParse(input).success).toBe(false);
  });

  it('rejeita maxUses <= 0', () => {
    expect(createCouponSchema.safeParse(base({ maxUses: 0 })).success).toBe(false);
  });

  it('rejeita code vazio', () => {
    expect(createCouponSchema.safeParse(base({ code: '' })).success).toBe(false);
  });

  it('minOrderCents default é 0', () => {
    const result = createCouponSchema.safeParse(base());
    expect(result.success && result.data.minOrderCents).toBe(0);
  });
});

describe('updateCouponSchema', () => {
  it('aceita só version (nenhum campo mudando)', () => {
    expect(updateCouponSchema.safeParse({ version: 0 }).success).toBe(true);
  });

  it('exige version', () => {
    expect(updateCouponSchema.safeParse({ active: false }).success).toBe(false);
  });
});
