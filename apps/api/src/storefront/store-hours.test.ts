import { describe, expect, it } from 'vitest';
import {
  computeStoreOpenState,
  isWithinAnyShift,
  localWeekdayAndMinutes,
  localWeekMinutes,
  slotOccurrenceRange,
  type StoreShift,
} from './store-hours';

const TZ = 'America/Sao_Paulo'; // GMT-3, sem horário de verão desde 2019 — offset estável pros testes.

/** Turnos da Hamburgueria da Vila: ter–dom, 12h–14h30 e 18h30–23h, segunda fechado. */
const VILA_SHIFTS: StoreShift[] = [
  ...(['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).flatMap((dayOfWeek) => [
    { dayOfWeek, opensAtMinutes: 12 * 60, closesAtMinutes: 14 * 60 + 30 },
    { dayOfWeek, opensAtMinutes: 18 * 60 + 30, closesAtMinutes: 23 * 60 },
  ]),
];

/** 2026-07-21 é terça-feira. */
function saoPauloInstant(hour: number, minute = 0, day = 21): Date {
  // GMT-3 fixo: 13h em São Paulo = 16h UTC no mesmo dia civil.
  return new Date(Date.UTC(2026, 6, day, hour + 3, minute));
}

describe('computeStoreOpenState', () => {
  it('aberto durante o turno de almoço', () => {
    const result = computeStoreOpenState(VILA_SHIFTS, TZ, saoPauloInstant(13, 0));
    expect(result).toEqual({ isOpenNow: true, nextOpensAt: null });
  });

  it('aberto durante o turno de jantar', () => {
    const result = computeStoreOpenState(VILA_SHIFTS, TZ, saoPauloInstant(20, 0));
    expect(result).toEqual({ isOpenNow: true, nextOpensAt: null });
  });

  it('fechado no intervalo entre almoço e jantar — próxima abertura é 18h30 do mesmo dia', () => {
    const result = computeStoreOpenState(VILA_SHIFTS, TZ, saoPauloInstant(16, 0));
    expect(result.isOpenNow).toBe(false);
    expect(result.nextOpensAt).toBe('2026-07-21T18:30:00-03:00');
  });

  it('segunda-feira fechada o dia inteiro — próxima abertura é terça 12h', () => {
    // 2026-07-20 é segunda-feira.
    const result = computeStoreOpenState(VILA_SHIFTS, TZ, saoPauloInstant(15, 0, 20));
    expect(result.isOpenNow).toBe(false);
    expect(result.nextOpensAt).toBe('2026-07-21T12:00:00-03:00');
  });

  it('sem nenhum turno cadastrado: sempre fechado, sem próxima abertura', () => {
    const result = computeStoreOpenState([], TZ, saoPauloInstant(13, 0));
    expect(result).toEqual({ isOpenNow: false, nextOpensAt: null });
  });

  it('turno que atravessa meia-noite: aberto às 23h30 (bar sexta 22h–sábado 02h)', () => {
    const barShifts: StoreShift[] = [{ dayOfWeek: 'friday', opensAtMinutes: 22 * 60, closesAtMinutes: 2 * 60 }];
    // 2026-07-24 é sexta-feira, 23h30.
    const result = computeStoreOpenState(barShifts, TZ, saoPauloInstant(23, 30, 24));
    expect(result).toEqual({ isOpenNow: true, nextOpensAt: null });
  });

  it('turno que atravessa meia-noite: ainda aberto às 01h30 de sábado (mesmo turno de sexta)', () => {
    const barShifts: StoreShift[] = [{ dayOfWeek: 'friday', opensAtMinutes: 22 * 60, closesAtMinutes: 2 * 60 }];
    // 2026-07-25 é sábado, 01h30 — ainda dentro do turno que começou sexta.
    const result = computeStoreOpenState(barShifts, TZ, saoPauloInstant(1, 30, 25));
    expect(result).toEqual({ isOpenNow: true, nextOpensAt: null });
  });

  it('turno que atravessa meia-noite: fechado às 03h de sábado, próxima abertura é a sexta seguinte', () => {
    const barShifts: StoreShift[] = [{ dayOfWeek: 'friday', opensAtMinutes: 22 * 60, closesAtMinutes: 2 * 60 }];
    const result = computeStoreOpenState(barShifts, TZ, saoPauloInstant(3, 0, 25));
    expect(result.isOpenNow).toBe(false);
    expect(result.nextOpensAt).toBe('2026-07-31T22:00:00-03:00');
  });
});

/** Épico conversão (C3) — docs/handoff-features-conversao-gestor.md A3. */
describe('localWeekdayAndMinutes', () => {
  it('converte um instante UTC pro dia/minuto local da loja', () => {
    // 2026-07-21 é terça, 13h em São Paulo (GMT-3).
    const result = localWeekdayAndMinutes(TZ, saoPauloInstant(13, 0));
    expect(result).toEqual({ dayOfWeek: 'tuesday', minutes: 13 * 60 });
  });

  it('vira de dia perto da meia-noite', () => {
    // 2026-07-25 é sábado, 00h10.
    const result = localWeekdayAndMinutes(TZ, saoPauloInstant(0, 10, 25));
    expect(result).toEqual({ dayOfWeek: 'saturday', minutes: 10 });
  });
});

describe('isWithinAnyShift', () => {
  it('true durante o turno de almoço', () => {
    expect(isWithinAnyShift(VILA_SHIFTS, localWeekMinutes(TZ, saoPauloInstant(13, 0)))).toBe(true);
  });

  it('false entre os turnos (16h, intervalo da tarde)', () => {
    expect(isWithinAnyShift(VILA_SHIFTS, localWeekMinutes(TZ, saoPauloInstant(16, 0)))).toBe(false);
  });

  it('turno que atravessa meia-noite: true às 01h30 de sábado (mesmo turno de sexta)', () => {
    const barShifts: StoreShift[] = [{ dayOfWeek: 'friday', opensAtMinutes: 22 * 60, closesAtMinutes: 2 * 60 }];
    expect(isWithinAnyShift(barShifts, localWeekMinutes(TZ, saoPauloInstant(1, 30, 25)))).toBe(true);
  });
});

describe('slotOccurrenceRange', () => {
  it('converte startsAtMinutes/endsAtMinutes locais pros instantes UTC do MESMO dia civil', () => {
    // Slot sexta 18h-20h; `at` é sexta 13h (mesmo dia da ocorrência).
    const slot = { startsAtMinutes: 18 * 60, endsAtMinutes: 20 * 60 };
    const result = slotOccurrenceRange(TZ, saoPauloInstant(13, 0, 24), slot);

    expect(result.start.toISOString()).toBe(saoPauloInstant(18, 0, 24).toISOString());
    expect(result.end.toISOString()).toBe(saoPauloInstant(20, 0, 24).toISOString());
  });
});
