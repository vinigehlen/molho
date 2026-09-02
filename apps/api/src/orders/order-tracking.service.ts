import { orderTrackingResponseSchema, type OrderTrackingResponse } from '@molho/contracts';
import type { OrderTrackingRepository } from './order-tracking.repository';

export class OrderTrackingService {
  constructor(private readonly repo: OrderTrackingRepository) {}

  async findByToken(token: string): Promise<OrderTrackingResponse | null> {
    const tracking = await this.repo.findByToken(token);
    return tracking ? orderTrackingResponseSchema.parse(tracking) : null;
  }
}
