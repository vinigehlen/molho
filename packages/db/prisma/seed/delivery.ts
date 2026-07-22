/**
 * Zonas de entrega e horário de funcionamento — Épico 6.
 *
 * Só a Hamburgueria da Vila ganha zona/horário neste seed (Pizzaria Roma
 * segue só pro teste de isolamento entre tenants, já coberto pelo catálogo
 * mínimo do Épico 4 — não precisa de mais dado pra isso).
 */

export type SeedWeekday =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export interface SeedShiftDef {
  dayOfWeek: SeedWeekday;
  opensAtMinutes: number;
  closesAtMinutes: number;
}

export interface SeedZoneDef {
  name: string;
  /** Zona seed é um círculo — raio a partir do Store.geo, via ST_Buffer (geography, metros de verdade). */
  radiusMeters: number;
  feeCents: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  priority: number;
}

export interface SeedDeliveryDef {
  tenantSlug: string;
  shifts: readonly SeedShiftDef[];
  zones: readonly SeedZoneDef[];
}

/** Minutos desde meia-noite — mesma unidade de StoreHours.opensAtMinutes/closesAtMinutes. */
function hm(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

const VILA_DIAS_ABERTOS: readonly SeedWeekday[] = [
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const SEED_DELIVERY: readonly SeedDeliveryDef[] = [
  {
    tenantSlug: 'hamburgueria-da-vila',
    // ter–dom, 12h–14h30 e 18h30–23h, segunda fechado (ausência de linha —
    // nunca uma linha com flag "fechado").
    shifts: VILA_DIAS_ABERTOS.flatMap((dayOfWeek) => [
      { dayOfWeek, opensAtMinutes: hm(12), closesAtMinutes: hm(14, 30) },
      { dayOfWeek, opensAtMinutes: hm(18, 30), closesAtMinutes: hm(23) },
    ]),
    zones: [
      {
        name: 'Zona padrão (10km)',
        radiusMeters: 10_000,
        feeCents: 800,
        etaMinMinutes: 30,
        etaMaxMinutes: 50,
        priority: 0,
      },
    ],
  },
] as const;
