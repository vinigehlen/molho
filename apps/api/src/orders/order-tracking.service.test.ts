import { describe, expect, it } from 'vitest';
import type { OrderTrackingResponse } from '@molho/contracts';
import type { OrderTrackingRepository } from './order-tracking.repository';
import { OrderTrackingService } from './order-tracking.service';

const TRACKING: OrderTrackingResponse = {
  orderId: '018f3c2a-0000-7000-8000-000000000001',
  status: 'ready',
  fulfillmentType: 'pickup',
  fulfillmentDeadlineAt: '2026-09-02T22:30:00.000Z',
  totalCents: 4290,
  canceledReason: null,
  items: [{ name: 'X-Burger', quantity: 1 }],
  timeline: [{ status: 'received', at: '2026-09-02T21:40:00.000Z' }],
};

class FakeTrackingRepository implements OrderTrackingRepository {
  value: OrderTrackingResponse | null = TRACKING;

  async findByToken() {
    return this.value;
  }
}

describe('OrderTrackingService', () => {
  it('devolve o payload público validado', async () => {
    const repo = new FakeTrackingRepository();
    await expect(new OrderTrackingService(repo).findByToken('token')).resolves.toEqual(TRACKING);
  });

  it('preserva 404 genérico quando o token não encontra pedido', async () => {
    const repo = new FakeTrackingRepository();
    repo.value = null;
    await expect(new OrderTrackingService(repo).findByToken('token')).resolves.toBeNull();
  });
});
