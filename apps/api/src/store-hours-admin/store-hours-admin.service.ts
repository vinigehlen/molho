import type { PutStoreHoursInput, StoreHoursResponse } from '@molho/contracts';
import { StoreHoursValidationError } from './store-hours-admin.errors';
import type { StoreHoursAdminRepository } from './store-hours-admin.repository';

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const DAY_INDEX: Record<PutStoreHoursInput['shifts'][number]['dayOfWeek'], number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

type Interval = { start: number; end: number };

function toWeeklyIntervals(input: PutStoreHoursInput): Interval[] {
  return input.shifts.flatMap((shift) => {
    const dayStart = DAY_INDEX[shift.dayOfWeek] * MINUTES_PER_DAY;
    const start = dayStart + shift.opensAtMinutes;
    const end = dayStart + shift.closesAtMinutes + (shift.closesAtMinutes < shift.opensAtMinutes ? MINUTES_PER_DAY : 0);

    if (end <= MINUTES_PER_WEEK) return [{ start, end }];

    // Sábado atravessando meia-noite ocupa também o início do domingo.
    return [
      { start, end: MINUTES_PER_WEEK },
      { start: 0, end: end - MINUTES_PER_WEEK },
    ];
  });
}

function hasOverlap(input: PutStoreHoursInput): boolean {
  const intervals = toWeeklyIntervals(input).sort((a, b) => a.start - b.start || a.end - b.end);
  return intervals.some((interval, index) => index > 0 && interval.start < intervals[index - 1]!.end);
}

export class StoreHoursAdminService {
  constructor(private readonly repo: StoreHoursAdminRepository) {}

  list(storeId: string): Promise<StoreHoursResponse> {
    return this.repo.list(storeId);
  }

  replaceAll(storeId: string, input: PutStoreHoursInput): Promise<StoreHoursResponse> {
    this.assertInvariants(input);
    return this.repo.replaceAll(storeId, input);
  }

  private assertInvariants(input: PutStoreHoursInput): void {
    for (const shift of input.shifts) {
      if (shift.opensAtMinutes === shift.closesAtMinutes) {
        throw new StoreHoursValidationError('Turno precisa ter abertura e fechamento diferentes.');
      }
    }

    if (hasOverlap(input)) {
      throw new StoreHoursValidationError('Turnos não podem se sobrepor, inclusive na virada do dia.');
    }
  }
}
