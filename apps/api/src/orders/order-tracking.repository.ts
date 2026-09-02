import type { OrderTrackingResponse } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';

export interface OrderTrackingRepository {
  findByToken(token: string): Promise<OrderTrackingResponse | null>;
}

export class PrismaOrderTrackingRepository implements OrderTrackingRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findByToken(token: string): Promise<OrderTrackingResponse | null> {
    const order = await this.requestContext.getClient().order.findFirst({
      where: { trackingToken: token, deletedAt: null },
      select: {
        id: true,
        status: true,
        fulfillmentType: true,
        fulfillmentDeadlineAt: true,
        totalCents: true,
        currentTotalCents: true,
        canceledReason: true,
        createdAt: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: { name: true, quantity: true },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { toStatus: true, createdAt: true },
        },
      },
    });
    if (!order) return null;

    const timeline =
      order.statusHistory.length > 0
        ? order.statusHistory.map((row) => ({
            status: row.toStatus,
            at: row.createdAt.toISOString(),
          }))
        : [{ status: order.status, at: order.createdAt.toISOString() }];

    return {
      orderId: order.id,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      fulfillmentDeadlineAt: order.fulfillmentDeadlineAt?.toISOString() ?? null,
      totalCents: order.currentTotalCents ?? order.totalCents,
      canceledReason: order.canceledReason,
      items: order.items,
      timeline,
    };
  }
}
