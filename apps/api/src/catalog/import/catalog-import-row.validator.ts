import type { RawImportRow } from './catalog-import-parser';
import { parseImportAvailability, parseImportPriceCents } from './import-price.util';

export interface ValidatedImportRow {
  line: number;
  categoria: string;
  produto: string;
  descricao: string;
  basePriceCents: number;
  available: boolean;
  /** undefined = linha válida. */
  error?: string;
}

/** Pura, sem I/O — testável direto. Cada erro de campo vira uma frase, juntadas com "; ". */
export function validateImportRow(raw: RawImportRow): ValidatedImportRow {
  const errors: string[] = [];

  if (!raw.categoria) errors.push('categoria é obrigatória');
  if (!raw.produto) errors.push('produto é obrigatório');

  const priceCents = parseImportPriceCents(raw.preco);
  if (priceCents === null) errors.push('preço inválido');

  const available = parseImportAvailability(raw.disponivel);
  if (available === null) errors.push('disponível deve ser sim/não');

  return {
    line: raw.line,
    categoria: raw.categoria,
    produto: raw.produto,
    descricao: raw.descricao,
    basePriceCents: priceCents ?? 0,
    available: available ?? true,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}
