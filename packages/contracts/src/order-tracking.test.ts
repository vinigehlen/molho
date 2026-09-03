import { describe, expect, it } from 'vitest';
import { orderTrackingResponseSchema } from './order-tracking';

const UUID = '018f3c2a-0000-7000-8000-000000000001';

const TRACKING = {
  orderId: UUID,
  status: 'preparing',
  fulfillmentType: 'delivery',
  fulfillmentDeadlineAt: '2026-09-02T22:30:00.000Z',
  totalCents: 4290,
  canceledReason: null,
  items: [{ name: 'X-Burger', quantity: 1 }],
  timeline: [
    { status: 'received', at: '2026-09-02T21:40:00.000Z' },
    { status: 'preparing', at: '2026-09-02T21:44:00.000Z' },
  ],
} as const;

describe('orderTrackingResponseSchema', () => {
  it('aceita só o recorte público do acompanhamento', () => {
    expect(orderTrackingResponseSchema.safeParse(TRACKING).success).toBe(true);
  });

  it('rejeita PII e dados internos por ser strictObject', () => {
    const vazando = {
      ...TRACKING,
      customerPhone: '+5551999990000',
      deliveryStreet: 'Rua Secreta',
      actorId: UUID,
      timeline: [{ ...TRACKING.timeline[0], actorRole: 'owner', reason: 'interno' }],
    };

    expect(orderTrackingResponseSchema.safeParse(vazando).success).toBe(false);
  });
});
