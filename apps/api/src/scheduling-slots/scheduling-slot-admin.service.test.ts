import type { PutSchedulingSlotsInput, SchedulingSlotsResponse } from '@molho/contracts';
import { describe, expect, it } from 'vitest';
import { SchedulingSlotValidationError } from './scheduling-slot-admin.errors';
import type { SchedulingSlotAdminRepository } from './scheduling-slot-admin.repository';
import { SchedulingSlotAdminService } from './scheduling-slot-admin.service';

class FakeSchedulingSlotAdminRepository implements SchedulingSlotAdminRepository {
  saved: PutSchedulingSlotsInput = { slots: [] };

  async list(): Promise<SchedulingSlotsResponse> {
    return this.saved;
  }

  async replaceAll(_storeId: string, input: PutSchedulingSlotsInput): Promise<SchedulingSlotsResponse> {
    this.saved = input;
    return input;
  }
}

function setup() {
  const repo = new FakeSchedulingSlotAdminRepository();
  return { repo, service: new SchedulingSlotAdminService(repo) };
}

describe('SchedulingSlotAdminService', () => {
  it('1) replaceAll() aceita slots sem sobreposição no mesmo dia', async () => {
    const { service } = setup();
    const result = await service.replaceAll('store-1', {
      slots: [
        { dayOfWeek: 'friday', startsAtMinutes: 1080, endsAtMinutes: 1200, maxOrders: 5 }, // 18h-20h
        { dayOfWeek: 'friday', startsAtMinutes: 1200, endsAtMinutes: 1320, maxOrders: 5 }, // 20h-22h, encosta mas não sobrepõe
      ],
    });
    expect(result.slots).toHaveLength(2);
  });

  it('2) replaceAll() aceita mesmo horário em dias DIFERENTES', async () => {
    const { service } = setup();
    const result = await service.replaceAll('store-1', {
      slots: [
        { dayOfWeek: 'friday', startsAtMinutes: 1080, endsAtMinutes: 1200, maxOrders: 5 },
        { dayOfWeek: 'saturday', startsAtMinutes: 1080, endsAtMinutes: 1200, maxOrders: 5 },
      ],
    });
    expect(result.slots).toHaveLength(2);
  });

  it('3) replaceAll() rejeita slots sobrepostos no MESMO dia', async () => {
    const { service } = setup();
    await expect(
      service.replaceAll('store-1', {
        slots: [
          { dayOfWeek: 'friday', startsAtMinutes: 1080, endsAtMinutes: 1200, maxOrders: 5 },
          { dayOfWeek: 'friday', startsAtMinutes: 1150, endsAtMinutes: 1260, maxOrders: 5 },
        ],
      }),
    ).rejects.toThrow(SchedulingSlotValidationError);
  });

  it('4) replaceAll() com lista vazia limpa os slots', async () => {
    const { service, repo } = setup();
    await service.replaceAll('store-1', { slots: [{ dayOfWeek: 'friday', startsAtMinutes: 0, endsAtMinutes: 60, maxOrders: 1 }] });
    await service.replaceAll('store-1', { slots: [] });
    expect(repo.saved.slots).toHaveLength(0);
  });
});
