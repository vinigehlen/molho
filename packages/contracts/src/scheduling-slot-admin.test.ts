import { describe, expect, it } from 'vitest';
import { putSchedulingSlotsSchema, schedulingSlotSchema } from './scheduling-slot-admin';

describe('schedulingSlotSchema', () => {
  it('aceita slot válido', () => {
    const result = schedulingSlotSchema.safeParse({
      dayOfWeek: 'friday',
      startsAtMinutes: 1080,
      endsAtMinutes: 1200,
      maxOrders: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejeita startsAtMinutes >= endsAtMinutes — v1 não modela virada de dia', () => {
    const result = schedulingSlotSchema.safeParse({
      dayOfWeek: 'friday',
      startsAtMinutes: 1200,
      endsAtMinutes: 1080,
      maxOrders: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejeita maxOrders <= 0', () => {
    const result = schedulingSlotSchema.safeParse({
      dayOfWeek: 'friday',
      startsAtMinutes: 0,
      endsAtMinutes: 60,
      maxOrders: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('putSchedulingSlotsSchema', () => {
  it('aceita lista vazia — "sem slot nenhum agendável"', () => {
    expect(putSchedulingSlotsSchema.safeParse({ slots: [] }).success).toBe(true);
  });
});
