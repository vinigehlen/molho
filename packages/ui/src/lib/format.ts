/**
 * Dinheiro no Molho é SEMPRE inteiro em centavos. Nunca float.
 * Regra não-negociável (CLAUDE.md §4) — 19,90 é 1990, não 19.9.
 *
 * Este módulo é a única porta de entrada e saída desse inteiro na UI.
 */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * O ICU separa "R$" do número com espaço não-quebrável (U+00A0). Montado pelo
 * código-ponto de propósito: o caractere literal é invisível no editor e o lint
 * o rejeita (no-irregular-whitespace) — com razão.
 */
const NBSP = new RegExp(String.fromCharCode(0x00a0), 'g');

/** 1990 → "R$ 19,90" */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`Dinheiro precisa ser inteiro em centavos, recebi: ${cents}`);
  }
  // Troca por espaço comum: a saída fica idêntica entre Node e browser, e o
  // valor que o cliente copia não leva caractere invisível junto.
  return BRL.format(cents / 100).replace(NBSP, ' ');
}

/** 1990 → "+ R$ 19,90" · -500 → "− R$ 5,00" · 0 → "Grátis" (delta de modificador) */
export function formatCentsDelta(cents: number, zeroLabel = 'Grátis'): string {
  if (cents === 0) return zeroLabel;
  const sign = cents > 0 ? '+' : '−';
  return `${sign} ${formatCents(Math.abs(cents))}`;
}

/** "19,90" | "R$ 19,90" | "1990" (dígitos crus) → 1990. Entrada do usuário → centavos. */
export function parseCents(input: string): number {
  const digits = input.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}
