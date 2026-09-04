import { describe, expect, it } from 'vitest';
import { loyaltyEventSchema, loyaltyEventsResponseSchema } from './loyalty';

const EARN = {
  type: 'earn' as const,
  amountCents: 250,
  orderId: '018f3b1a-2b3c-7c4d-8e5f-6a7b8c9d0e1f',
  createdAt: '2026-09-01T12:00:00.000Z',
};

describe('loyaltyEventSchema', () => {
  it('aceita earn', () => {
    expect(loyaltyEventSchema.safeParse(EARN).success).toBe(true);
  });

  it('aceita redeem', () => {
    expect(loyaltyEventSchema.safeParse({ ...EARN, type: 'redeem' }).success).toBe(true);
  });

  it('rejeita type fora de earn|redeem', () => {
    expect(loyaltyEventSchema.safeParse({ ...EARN, type: 'bonus' }).success).toBe(false);
  });

  it('rejeita amountCents <= 0 — evento de valor zero não devia existir no ledger', () => {
    expect(loyaltyEventSchema.safeParse({ ...EARN, amountCents: 0 }).success).toBe(false);
  });

  it('rejeita campo extra (strictObject)', () => {
    expect(loyaltyEventSchema.safeParse({ ...EARN, extra: 'x' }).success).toBe(false);
  });
});

describe('loyaltyEventsResponseSchema', () => {
  it('aceita lista vazia', () => {
    expect(loyaltyEventsResponseSchema.safeParse({ events: [] }).success).toBe(true);
  });

  it('aceita lista com earn e redeem misturados', () => {
    expect(loyaltyEventsResponseSchema.safeParse({ events: [EARN, { ...EARN, type: 'redeem' }] }).success).toBe(true);
  });
});
