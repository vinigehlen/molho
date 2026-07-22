/**
 * "2026-07-22T12:00:00-03:00" → "12h" ou "18h30" — só lê os dígitos do ISO
 * que `nextOpensAt` já traz com o offset da loja embutido (contrato em
 * `@molho/contracts/storefront.ts`). Nunca recalcula fuso: o servidor já
 * fez essa conta, o cliente só formata pro copy `lojaFechada` ({horario}).
 */
export function formatarHorarioCurto(isoComOffset: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(isoComOffset);
  if (!match) return '';
  const [, hora, minuto] = match;
  return minuto === '00' ? `${Number(hora)}h` : `${Number(hora)}h${minuto}`;
}
