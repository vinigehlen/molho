import { orderNotificationResponseSchema, type OrderNotificationResponse } from '@molho/contracts';
import { OrderNotFoundError } from './order-errors';
import type { CreateOrderNotificationInput, OrderNotificationRepository } from './order-notification.repository';

export class OrderNotificationService {
  constructor(private readonly repo: OrderNotificationRepository) {}

  async create(input: CreateOrderNotificationInput): Promise<OrderNotificationResponse> {
    const notification = await this.repo.create(input);
    if (!notification) throw new OrderNotFoundError();
    return orderNotificationResponseSchema.parse(notification);
  }
}
