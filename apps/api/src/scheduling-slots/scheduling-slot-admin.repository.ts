import type { PutSchedulingSlotsInput, SchedulingSlotsResponse } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import { SchedulingSlotStoreNotFoundError } from './scheduling-slot-admin.errors';

export interface SchedulingSlotAdminRepository {
  list(storeId: string): Promise<SchedulingSlotsResponse>;
  replaceAll(storeId: string, input: PutSchedulingSlotsInput): Promise<SchedulingSlotsResponse>;
}

/** Mesmo desenho de PrismaStoreHoursAdminRepository — ver comentários lá. */
export class PrismaSchedulingSlotAdminRepository implements SchedulingSlotAdminRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async list(storeId: string): Promise<SchedulingSlotsResponse> {
    await this.assertStoreExists(storeId);
    const slots = await this.requestContext.getClient().storeSchedulingSlot.findMany({
      where: { storeId, deletedAt: null },
      select: { dayOfWeek: true, startsAtMinutes: true, endsAtMinutes: true, maxOrders: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startsAtMinutes: 'asc' }],
    });
    return { slots };
  }

  async replaceAll(storeId: string, input: PutSchedulingSlotsInput): Promise<SchedulingSlotsResponse> {
    await this.lockStoreOrThrow(storeId);
    const tenantId = this.requestContext.getTenantId();
    const client = this.requestContext.getClient();

    await client.storeSchedulingSlot.updateMany({
      where: { storeId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    if (input.slots.length > 0) {
      await client.storeSchedulingSlot.createMany({
        data: input.slots.map((slot) => ({
          tenantId,
          storeId,
          dayOfWeek: slot.dayOfWeek,
          startsAtMinutes: slot.startsAtMinutes,
          endsAtMinutes: slot.endsAtMinutes,
          maxOrders: slot.maxOrders,
        })),
      });
    }

    return this.list(storeId);
  }

  private async lockStoreOrThrow(storeId: string): Promise<void> {
    const rows = await this.requestContext.getClient().$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "stores"
      WHERE "id" = ${storeId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    if (rows.length === 0) throw new SchedulingSlotStoreNotFoundError();
  }

  private async assertStoreExists(storeId: string): Promise<void> {
    const store = await this.requestContext.getClient().store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: { id: true },
    });
    if (!store) throw new SchedulingSlotStoreNotFoundError();
  }
}
