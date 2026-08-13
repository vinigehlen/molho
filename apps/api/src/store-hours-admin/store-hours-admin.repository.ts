import type { PutStoreHoursInput, StoreHoursResponse } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import { StoreHoursStoreNotFoundError } from './store-hours-admin.errors';

export interface StoreHoursAdminRepository {
  list(storeId: string): Promise<StoreHoursResponse>;
  replaceAll(storeId: string, input: PutStoreHoursInput): Promise<StoreHoursResponse>;
}

export class PrismaStoreHoursAdminRepository implements StoreHoursAdminRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async list(storeId: string): Promise<StoreHoursResponse> {
    await this.assertStoreExists(storeId);
    const shifts = await this.requestContext.getClient().storeHours.findMany({
      where: { storeId, deletedAt: null },
      select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true },
      orderBy: [{ dayOfWeek: 'asc' }, { opensAtMinutes: 'asc' }],
    });
    return { shifts };
  }

  async replaceAll(storeId: string, input: PutStoreHoursInput): Promise<StoreHoursResponse> {
    await this.assertStoreExists(storeId);
    const tenantId = this.requestContext.getTenantId();
    const client = this.requestContext.getClient();

    await client.storeHours.updateMany({
      where: { storeId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    if (input.shifts.length > 0) {
      await client.storeHours.createMany({
        data: input.shifts.map((shift) => ({
          tenantId,
          storeId,
          dayOfWeek: shift.dayOfWeek,
          opensAtMinutes: shift.opensAtMinutes,
          closesAtMinutes: shift.closesAtMinutes,
        })),
      });
    }

    return this.list(storeId);
  }

  private async assertStoreExists(storeId: string): Promise<void> {
    const store = await this.requestContext.getClient().store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: { id: true },
    });
    if (!store) throw new StoreHoursStoreNotFoundError();
  }
}
