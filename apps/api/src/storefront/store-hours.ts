/**
 * "Aberto agora" e "próxima abertura" — calculado sempre no timezone da
 * LOJA (`Store.timezone`), nunca no relógio de quem chama. CLAUDE.md: essa é
 * uma regra sem exceção do Épico 6.
 *
 * Sem lib de data: `Intl.DateTimeFormat` com `timeZoneName: 'longOffset'`
 * dá o offset UTC da zona no instante pedido — o suficiente pra converter
 * entre "instante real" e "relógio de parede local" sem trazer uma
 * dependência inteira pra isso. Simplificação assumida: o offset não muda
 * dentro da janela de até 7 dias que `nextOpensAt` pode olhar pra frente —
 * verdade pra `America/Sao_Paulo` (sem horário de verão desde 2019, o único
 * timezone usado no MVP), não necessariamente pra toda IANA zone do mundo.
 */

export type Weekday = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

const WEEKDAYS: readonly Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export interface StoreShift {
  dayOfWeek: Weekday;
  /** Minutos desde meia-noite (0–1439), turno começa neste dia. */
  opensAtMinutes: number;
  /** `< opensAtMinutes` significa "fecha no dia seguinte" (ver store_hours no schema.prisma). */
  closesAtMinutes: number;
}

export interface StoreOpenState {
  isOpenNow: boolean;
  /** ISO 8601 com o offset do timezone da loja embutido. `null` se aberta agora ou sem nenhum turno cadastrado. */
  nextOpensAt: string | null;
}

function utcOffsetMinutes(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(
    at,
  );
  const raw = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(raw);
  if (!match) return 0;
  const [, sign, hours, minutes] = match;
  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
}

/** Formata um "relógio de parede local" (millis lidos como se fossem UTC) como ISO com offset explícito. */
function formatIsoWithOffset(localAsUtcMillis: number, offsetMinutes: number): string {
  const d = new Date(localAsUtcMillis);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const offset = `${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${date}T${time}${sign}${offset}`;
}

function shiftDurationMinutes(shift: StoreShift): number {
  return shift.closesAtMinutes > shift.opensAtMinutes
    ? shift.closesAtMinutes - shift.opensAtMinutes
    : MINUTES_PER_DAY - shift.opensAtMinutes + shift.closesAtMinutes;
}

/** Distância circular (sempre >= 0) de `from` até `to` numa semana de MINUTES_PER_WEEK minutos. */
function forwardDistance(from: number, to: number): number {
  return ((to - from) % MINUTES_PER_WEEK + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
}

export function computeStoreOpenState(
  shifts: readonly StoreShift[],
  timezone: string,
  now: Date = new Date(),
): StoreOpenState {
  const offset = utcOffsetMinutes(timezone, now);
  // Relógio de parede local, lido via getters UTC — evita o timezone do
  // processo Node interferir (mesmo truque usado pra formatar de volta).
  const localNow = new Date(now.getTime() + offset * 60_000);
  const nowWeekMinutes =
    localNow.getUTCDay() * MINUTES_PER_DAY + localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
  // Trunca segundos/ms — "aberto agora" e "próxima abertura" não precisam
  // de precisão de sub-minuto, e simplifica a aritmética circular abaixo.
  const localNowTruncatedMillis = localNow.getTime() - (localNow.getUTCSeconds() * 1000 + localNow.getUTCMilliseconds());

  let soonestStartDelta = Infinity;

  for (const shift of shifts) {
    const dayIndex = WEEKDAYS.indexOf(shift.dayOfWeek);
    const start = dayIndex * MINUTES_PER_DAY + shift.opensAtMinutes;
    const duration = shiftDurationMinutes(shift);

    if (forwardDistance(start, nowWeekMinutes) < duration) {
      return { isOpenNow: true, nextOpensAt: null };
    }

    const untilStart = forwardDistance(nowWeekMinutes, start);
    if (untilStart < soonestStartDelta) soonestStartDelta = untilStart;
  }

  if (!Number.isFinite(soonestStartDelta)) return { isOpenNow: false, nextOpensAt: null };

  const nextOpensLocalMillis = localNowTruncatedMillis + soonestStartDelta * 60_000;
  return { isOpenNow: false, nextOpensAt: formatIsoWithOffset(nextOpensLocalMillis, offset) };
}
