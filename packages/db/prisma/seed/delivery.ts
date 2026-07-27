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

const WEEKDAYS: readonly SeedWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/**
 * "Fechado num dia" é dado REALISTA (todo restaurante fecha um dia) e precisa
 * ser testável — mas o dia fechado NÃO pode calhar de ser HOJE, senão quebra
 * demo/teste quando o seed roda naquele dia da semana (mordeu no Épico 9: seed
 * fechava segunda, teste caiu numa segunda). Então o dia fechado é RELATIVO ao
 * dia do seed, no fuso da loja (America/Sao_Paulo — o mesmo que a lógica de
 * "aberto agora" usa): fecha 2 dias à frente de hoje (determinístico, nunca
 * hoje). Resultado: hoje sempre aberto, sempre exatamente um dia fechado, em
 * qualquer dia que o seed rodar. Continua "ausência de linha", nunca flag.
 */
function seedClosedWeekdayIndex(): number {
  const todaySP = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'long' })
    .format(new Date())
    .toLowerCase();
  const todayIndex = WEEKDAYS.indexOf(todaySP as SeedWeekday);
  return (todayIndex + 2) % 7;
}

const VILA_DIAS_ABERTOS: readonly SeedWeekday[] = WEEKDAYS.filter((_, i) => i !== seedClosedWeekdayIndex());

export const SEED_DELIVERY: readonly SeedDeliveryDef[] = [
  {
    tenantSlug: 'hamburgueria-da-vila',
    // 6 dias, 12h–14h30 e 18h30–23h; UM dia fechado, relativo ao dia do seed
    // (ver seedClosedWeekdayIndex) — hoje sempre aberto. Fechado = ausência de
    // linha, nunca uma linha com flag "fechado".
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
