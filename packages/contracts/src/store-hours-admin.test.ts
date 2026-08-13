import { describe, expect, it } from 'vitest';
import { putStoreHoursSchema } from './store-hours-admin';

describe('putStoreHoursSchema', () => {
  it('aceita turno normal (abre antes de fechar, mesmo dia)', () => {
    const shifts = [{ dayOfWeek: 'monday' as const, opensAtMinutes: 660, closesAtMinutes: 900 }];
    expect(putStoreHoursSchema.safeParse({ shifts }).success).toBe(true);
  });

  it('aceita turno que vira o dia (closes < opens é válido: fecha no dia seguinte)', () => {
    const shifts = [{ dayOfWeek: 'friday' as const, opensAtMinutes: 1320, closesAtMinutes: 120 }];
    expect(putStoreHoursSchema.safeParse({ shifts }).success).toBe(true);
  });

  it('aceita lista vazia (loja fechando a semana toda, sem turno nenhum)', () => {
    expect(putStoreHoursSchema.safeParse({ shifts: [] }).success).toBe(true);
  });

  it('rejeita dia da semana fora do enum', () => {
    const shifts = [{ dayOfWeek: 'someday', opensAtMinutes: 0, closesAtMinutes: 100 }];
    expect(putStoreHoursSchema.safeParse({ shifts }).success).toBe(false);
  });

  it('rejeita minutos fora de 0..1439', () => {
    expect(
      putStoreHoursSchema.safeParse({
        shifts: [{ dayOfWeek: 'monday', opensAtMinutes: -1, closesAtMinutes: 100 }],
      }).success,
    ).toBe(false);
    expect(
      putStoreHoursSchema.safeParse({
        shifts: [{ dayOfWeek: 'monday', opensAtMinutes: 0, closesAtMinutes: 1440 }],
      }).success,
    ).toBe(false);
  });

  it('rejeita minutos fracionados', () => {
    expect(
      putStoreHoursSchema.safeParse({
        shifts: [{ dayOfWeek: 'monday', opensAtMinutes: 60.5, closesAtMinutes: 100 }],
      }).success,
    ).toBe(false);
  });
});
