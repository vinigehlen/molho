import { describe, expect, it } from 'vitest';
import { markSubscriptionPaidSchema, subscriptionResponseSchema } from './billing';

describe('subscriptionResponseSchema', () => {
  it('aceita tenant em trial, sem período/atraso/cancelamento', () => {
    expect(
      subscriptionResponseSchema.safeParse({
        status: 'trial',
        planId: 'standard',
        trialEndsAt: '2026-09-11T00:00:00.000Z',
        currentPeriodEndsAt: null,
        pastDueAt: null,
        canceledAt: null,
      }).success,
    ).toBe(true);
  });

  it('rejeita status fora do enum', () => {
    expect(
      subscriptionResponseSchema.safeParse({
        status: 'delinquent',
        planId: 'standard',
        trialEndsAt: null,
        currentPeriodEndsAt: null,
        pastDueAt: null,
        canceledAt: null,
      }).success,
    ).toBe(false);
  });

  it('rejeita campo extra (strictObject)', () => {
    expect(
      subscriptionResponseSchema.safeParse({
        status: 'active',
        planId: null,
        trialEndsAt: null,
        currentPeriodEndsAt: null,
        pastDueAt: null,
        canceledAt: null,
        extra: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('markSubscriptionPaidSchema', () => {
  it('default periodDays é 30 quando ausente', () => {
    expect(markSubscriptionPaidSchema.parse({}).periodDays).toBe(30);
  });

  it('aceita periodDays customizado', () => {
    expect(markSubscriptionPaidSchema.parse({ periodDays: 90 }).periodDays).toBe(90);
  });

  it('rejeita periodDays <= 0', () => {
    expect(markSubscriptionPaidSchema.safeParse({ periodDays: 0 }).success).toBe(false);
  });
});
