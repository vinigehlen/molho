import { describe, expect, it } from 'vitest';
import { orderNotificationResponseSchema } from './order-notification';

const UUID = '018f3c2a-0000-7000-8000-000000000001';

describe('orderNotificationResponseSchema', () => {
  it('aceita o recibo operacional do click-to-chat', () => {
    expect(
      orderNotificationResponseSchema.safeParse({
        id: UUID,
        orderId: UUID,
        channel: 'whatsapp_ctc',
        orderStatusSnapshot: 'ready',
        createdAt: '2026-09-02T22:30:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejeita telefone, texto editado e ator por ser strictObject', () => {
    expect(
      orderNotificationResponseSchema.safeParse({
        id: UUID,
        orderId: UUID,
        channel: 'whatsapp_ctc',
        orderStatusSnapshot: 'ready',
        createdAt: '2026-09-02T22:30:00.000Z',
        phone: '5551999990000',
        message: 'Seu pedido saiu.',
        actorId: UUID,
        actorRole: 'owner',
      }).success,
    ).toBe(false);
  });
});
