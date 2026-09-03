import { describe, expect, it } from 'vitest';
import { createPromotionSchema, promotionResponseSchema, updatePromotionSchema } from './promotion';

const UUID = '018f3c2a-0000-7000-8000-000000000001';

describe('createPromotionSchema', () => {
  it('aceita store_wide sem scopeId', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Terça de desconto',
      discountType: 'percent',
      discountValue: 15,
      weekdays: [2],
      startTime: '18:00',
      endTime: '23:00',
      scope: 'store_wide',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita store_wide COM scopeId — mesmo XOR do CHECK na migration', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Terça de desconto',
      discountType: 'percent',
      discountValue: 15,
      weekdays: [2],
      startTime: '18:00',
      endTime: '23:00',
      scope: 'store_wide',
      scopeId: UUID,
    });
    expect(result.success).toBe(false);
  });

  it('rejeita category/product SEM scopeId', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Pizzas com desconto',
      discountType: 'fixed',
      discountValue: 500,
      weekdays: [1, 2, 3],
      startTime: '11:00',
      endTime: '15:00',
      scope: 'category',
    });
    expect(result.success).toBe(false);
  });

  it('aceita category COM scopeId', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Pizzas com desconto',
      discountType: 'fixed',
      discountValue: 500,
      weekdays: [1, 2, 3],
      startTime: '11:00',
      endTime: '15:00',
      scope: 'category',
      scopeId: UUID,
    });
    expect(result.success).toBe(true);
  });

  it('rejeita discountValue > 100 quando percent', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Exagero',
      discountType: 'percent',
      discountValue: 150,
      weekdays: [0],
      startTime: '10:00',
      endTime: '11:00',
      scope: 'store_wide',
    });
    expect(result.success).toBe(false);
  });

  it('aceita discountValue > 100 quando fixed (é centavos, não percentual)', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Fixo alto',
      discountType: 'fixed',
      discountValue: 1500,
      weekdays: [0],
      startTime: '10:00',
      endTime: '11:00',
      scope: 'store_wide',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita horário fora do formato HH:MM', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Formato ruim',
      discountType: 'percent',
      discountValue: 10,
      weekdays: [0],
      startTime: '10h',
      endTime: '11:00',
      scope: 'store_wide',
    });
    expect(result.success).toBe(false);
  });

  it('aceita janela cruzando a meia-noite (endTime < startTime)', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Happy hour da madrugada',
      discountType: 'percent',
      discountValue: 20,
      weekdays: [5, 6],
      startTime: '22:00',
      endTime: '02:00',
      scope: 'store_wide',
    });
    expect(result.success).toBe(true);
  });
});

describe('updatePromotionSchema', () => {
  it('aceita PATCH parcial só com version', () => {
    expect(updatePromotionSchema.safeParse({ version: 0 }).success).toBe(true);
  });

  it('rejeita campo desconhecido (strictObject)', () => {
    expect(updatePromotionSchema.safeParse({ version: 0, scope: 'product' }).success).toBe(false);
  });
});

describe('promotionResponseSchema', () => {
  it('aceita o formato completo', () => {
    const result = promotionResponseSchema.safeParse({
      id: UUID,
      name: 'Terça de desconto',
      discountType: 'percent',
      discountValue: 15,
      weekdays: [2],
      startTime: '18:00',
      endTime: '23:00',
      scope: 'store_wide',
      scopeId: null,
      active: true,
      version: 0,
    });
    expect(result.success).toBe(true);
  });
});
