/**
 * Aceita "24,90" (BR), "24.90" e "1.234,56"/"1,234.56" (milhar+decimal nas
 * duas ordens) — heurística: o separador que aparece POR ÚLTIMO na string é
 * o decimal, o outro (se houver) é milhar e é descartado. Devolve centavos
 * (CLAUDE.md regra 4: dinheiro é inteiro, nunca float) ou null se inválido.
 */
export function parseImportPriceCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

const AVAILABLE_TRUE = new Set(['sim', 's', 'yes', 'y', 'true', '1']);
const AVAILABLE_FALSE = new Set(['não', 'nao', 'n', 'no', 'false', '0']);

/** Coluna "disponivel" em branco = true (padrão do produto). */
export function parseImportAvailability(raw: string): boolean | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return true;
  if (AVAILABLE_TRUE.has(normalized)) return true;
  if (AVAILABLE_FALSE.has(normalized)) return false;
  return null;
}
