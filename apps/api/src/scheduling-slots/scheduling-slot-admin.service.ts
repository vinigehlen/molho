import type { PutSchedulingSlotsInput, SchedulingSlotsResponse } from '@molho/contracts';
import { SchedulingSlotValidationError } from './scheduling-slot-admin.errors';
import type { SchedulingSlotAdminRepository } from './scheduling-slot-admin.repository';

/**
 * Overlap só entre slots do MESMO dia — diferente de StoreHours, v1 não
 * modela slot atravessando meia-noite (startsAtMinutes < endsAtMinutes já
 * garantido pelo schema), então não precisa achatar a semana numa reta.
 */
function hasOverlap(input: PutSchedulingSlotsInput): boolean {
  const byDay = new Map<string, { start: number; end: number }[]>();
  for (const slot of input.slots) {
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push({ start: slot.startsAtMinutes, end: slot.endsAtMinutes });
    byDay.set(slot.dayOfWeek, list);
  }
  for (const intervals of byDay.values()) {
    intervals.sort((a, b) => a.start - b.start || a.end - b.end);
    if (intervals.some((interval, index) => index > 0 && interval.start < intervals[index - 1]!.end)) return true;
  }
  return false;
}

export class SchedulingSlotAdminService {
  constructor(private readonly repo: SchedulingSlotAdminRepository) {}

  list(storeId: string): Promise<SchedulingSlotsResponse> {
    return this.repo.list(storeId);
  }

  // async: sem isso, o throw síncrono de hasOverlap() escaparia da chamada
  // em vez de rejeitar a Promise (mesmo achado de CategoryService/CouponService).
  async replaceAll(storeId: string, input: PutSchedulingSlotsInput): Promise<SchedulingSlotsResponse> {
    if (hasOverlap(input)) {
      throw new SchedulingSlotValidationError('Slots do mesmo dia não podem se sobrepor.');
    }
    return this.repo.replaceAll(storeId, input);
  }
}
