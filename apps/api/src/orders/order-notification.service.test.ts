import { describe, expect, it } from 'vitest';
import { OrderNotFoundError } from './order-errors';
import type { CreateOrderNotificationInput, OrderNotificationRepository } from './order-notification.repository';
import { OrderNotificationService } from './order-notification.service';

class FakeOrderNotificationRepository implements OrderNotificationRepository {
  missing = false;
  inputs: CreateOrderNotificationInput[] = [];

  async create(input: CreateOrderNotificationInput) {
    this.inputs.push(input);
    if (this.missing) return null;
    return {
      id: '018f3c2a-0000-7000-8000-000000000001',
      orderId: input.orderId,
      channel: 'whatsapp_ctc' as const,
      orderStatusSnapshot: 'ready' as const,
      createdAt: '2026-09-02T22:30:00.000Z',
    };
  }
}

const ACTOR = { actorId: '018f3c2a-0000-7000-8000-000000000002', actorRole: 'cashier' };

describe('OrderNotificationService.create', () => {
  it('registra uma abertura de click-to-chat e retorna o recibo sem PII', async () => {
    const repo = new FakeOrderNotificationRepository();
    const service = new OrderNotificationService(repo);

    const notification = await service.create({ orderId: '018f3c2a-0000-7000-8000-000000000003', ...ACTOR });

    expect(repo.inputs).toEqual([{ orderId: '018f3c2a-0000-7000-8000-000000000003', ...ACTOR }]);
    expect(notification).toEqual({
      id: '018f3c2a-0000-7000-8000-000000000001',
      orderId: '018f3c2a-0000-7000-8000-000000000003',
      channel: 'whatsapp_ctc',
      orderStatusSnapshot: 'ready',
      createdAt: '2026-09-02T22:30:00.000Z',
    });
    expect(JSON.stringify(notification)).not.toMatch(/phone|telefone|message|texto|actor/i);
  });

  it('pedido inexistente vira erro de domínio', async () => {
    const repo = new FakeOrderNotificationRepository();
    repo.missing = true;
    const service = new OrderNotificationService(repo);

    await expect(service.create({ orderId: '018f3c2a-0000-7000-8000-000000000003', ...ACTOR })).rejects.toThrow(
      OrderNotFoundError,
    );
  });
});
