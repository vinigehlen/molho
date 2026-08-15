import { describe, expect, it } from 'vitest';
import { setEntitlementSchema } from './module-panel';

describe('setEntitlementSchema', () => {
  it('aceita status="active" sem trialEndsAt', () => {
    expect(setEntitlementSchema.safeParse({ status: 'active' }).success).toBe(true);
  });

  it('aceita status="revoked" sem trialEndsAt', () => {
    expect(setEntitlementSchema.safeParse({ status: 'revoked' }).success).toBe(true);
  });

  it('aceita status="trial" COM trialEndsAt', () => {
    expect(setEntitlementSchema.safeParse({ status: 'trial', trialEndsAt: '2026-09-01T00:00:00Z' }).success).toBe(
      true,
    );
  });

  it('rejeita status="trial" SEM trialEndsAt', () => {
    expect(setEntitlementSchema.safeParse({ status: 'trial' }).success).toBe(false);
  });

  it('rejeita status="active" COM trialEndsAt (campo só faz sentido em trial)', () => {
    expect(setEntitlementSchema.safeParse({ status: 'active', trialEndsAt: '2026-09-01T00:00:00Z' }).success).toBe(
      false,
    );
  });

  it('rejeita status fora do enum', () => {
    expect(setEntitlementSchema.safeParse({ status: 'suspended' }).success).toBe(false);
  });

  it('rejeita trialEndsAt que não é ISO datetime', () => {
    expect(setEntitlementSchema.safeParse({ status: 'trial', trialEndsAt: 'amanhã' }).success).toBe(false);
  });
});
