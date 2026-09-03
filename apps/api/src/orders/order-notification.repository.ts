import type { OrderNotificationResponse, OrderStatus } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';

export interface CreateOrderNotificationInput {
  orderId: string;
  actorId: string;
  actorRole: string;
}

export interface OrderNotificationRepository {
  create(input: CreateOrderNotificationInput): Promise<OrderNotificationResponse | null>;
}

export class PrismaOrderNotificationRepository implements OrderNotificationRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async create(input: CreateOrderNotificationInput): Promise<OrderNotificationResponse | null> {
    const client = this.requestContext.getClient();
    const order = await client.order.findFirst({
      where: { id: input.orderId, deletedAt: null },
      select: { id: true, tenantId: true, status: true },
    });
    if (!order) return null;

    const log = await client.notificationLog.create({
      data: {
        tenantId: order.tenantId,
        orderId: order.id,
        channel: 'whatsapp_ctc',
        orderStatusSnapshot: order.status,
        actorId: input.actorId,
        actorRole: input.actorRole,
      },
      select: {
        id: true,
        orderId: true,
        channel: true,
        orderStatusSnapshot: true,
        createdAt: true,
      },
    });

    return {
      id: log.id,
      orderId: log.orderId,
      channel: 'whatsapp_ctc',
      orderStatusSnapshot: log.orderStatusSnapshot as OrderStatus,
      createdAt: log.createdAt.toISOString(),
    };
  }
}
