import { describe, expect, it } from 'vitest';
import { createComboItemSchema, updateComboItemSchema } from './combo-admin';

const COMBO_ID = '018f47de-7e33-7c6a-8b2a-b65dc8a35e6f';
const CHILD_ID = '018f47de-7e33-7c6a-8b2a-b65dc8a35e70';
const base = { comboProductId: COMBO_ID, childProductId: CHILD_ID };

describe('contrato de ComboItem (combo fase 4.1a)', () => {
  it('quantidade default 1', () => {
    expect(createComboItemSchema.parse(base).quantity).toBe(1);
  });

  it('rejeita quantidade zero ou negativa', () => {
    expect(createComboItemSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(createComboItemSchema.safeParse({ ...base, quantity: -2 }).success).toBe(false);
  });

  it('rejeita childProductId ausente ou não-uuid', () => {
    expect(createComboItemSchema.safeParse({ comboProductId: COMBO_ID }).success).toBe(false);
    expect(createComboItemSchema.safeParse({ ...base, childProductId: 'x' }).success).toBe(false);
  });

  it('update exige version e aceita campos parciais', () => {
    expect(updateComboItemSchema.safeParse({ quantity: 2 }).success).toBe(false);
    expect(updateComboItemSchema.parse({ version: 0, quantity: 2 })).toEqual({ version: 0, quantity: 2 });
  });
});
