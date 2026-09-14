import { describe, expect, it } from 'vitest';
import {
  closeCashSessionSchema,
  createCashWithdrawalSchema,
  openCashSessionSchema,
  setStaffPinSchema,
  verifyStaffPinSchema,
} from './cash-session';

describe('openCashSessionSchema', () => {
  it('aceita fundo de caixa zero (loja que começa sem troco)', () => {
    expect(openCashSessionSchema.safeParse({ openingAmountCents: 0 }).success).toBe(true);
  });

  it('recusa valor negativo', () => {
    expect(openCashSessionSchema.safeParse({ openingAmountCents: -1 }).success).toBe(false);
  });

  it('recusa campo desconhecido (strictObject)', () => {
    expect(openCashSessionSchema.safeParse({ openingAmountCents: 100, extra: true }).success).toBe(false);
  });
});

describe('closeCashSessionSchema', () => {
  it('exige o valor contado', () => {
    expect(closeCashSessionSchema.safeParse({}).success).toBe(false);
    expect(closeCashSessionSchema.safeParse({ countedAmountCents: 0 }).success).toBe(true);
  });
});

describe('createCashWithdrawalSchema', () => {
  it('amountCents precisa ser positivo — zero não é sangria', () => {
    expect(createCashWithdrawalSchema.safeParse({ amountCents: 0 }).success).toBe(false);
    expect(createCashWithdrawalSchema.safeParse({ amountCents: 1 }).success).toBe(true);
  });

  it('approverUserId/approverPin são opcionais no schema — a obrigatoriedade é do serviço, não daqui', () => {
    expect(createCashWithdrawalSchema.safeParse({ amountCents: 5000 }).success).toBe(true);
  });

  it('PIN fora do formato 4-6 dígitos é recusado', () => {
    expect(
      createCashWithdrawalSchema.safeParse({ amountCents: 5000, approverPin: 'abcd' }).success,
    ).toBe(false);
    expect(
      createCashWithdrawalSchema.safeParse({ amountCents: 5000, approverPin: '123' }).success,
    ).toBe(false);
    expect(
      createCashWithdrawalSchema.safeParse({ amountCents: 5000, approverPin: '1234567' }).success,
    ).toBe(false);
    expect(
      createCashWithdrawalSchema.safeParse({ amountCents: 5000, approverPin: '1234' }).success,
    ).toBe(true);
  });
});

describe('setStaffPinSchema', () => {
  it('só 4 a 6 dígitos numéricos', () => {
    expect(setStaffPinSchema.safeParse({ pin: '0000' }).success).toBe(true);
    expect(setStaffPinSchema.safeParse({ pin: '123456' }).success).toBe(true);
    expect(setStaffPinSchema.safeParse({ pin: '12' }).success).toBe(false);
    expect(setStaffPinSchema.safeParse({ pin: 'abcd' }).success).toBe(false);
  });
});

describe('verifyStaffPinSchema', () => {
  it('exige userId e pin', () => {
    expect(verifyStaffPinSchema.safeParse({ userId: crypto.randomUUID(), pin: '1234' }).success).toBe(
      true,
    );
    expect(verifyStaffPinSchema.safeParse({ pin: '1234' }).success).toBe(false);
  });
});
