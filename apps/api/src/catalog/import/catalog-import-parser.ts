import * as XLSX from 'xlsx';

export interface RawImportRow {
  /** 1-based, contando só linhas de dados (cabeçalho não conta). */
  line: number;
  categoria: string;
  produto: string;
  descricao: string;
  preco: string;
  disponivel: string;
}

/**
 * xlsx (SheetJS) lê CSV e XLSX com a mesma API — um parser só pros dois
 * formatos do template (docs/03-self-setup.md §3, passo 3). Cabeçalhos são
 * normalizados (trim + lowercase) porque planilha exportada por
 * Excel/Sheets varia capitalização ("Categoria" vs "categoria").
 */
export function parseImportFile(buffer: Buffer): RawImportRow[] {
  // codepage 65001 (UTF-8) explícito: sem isso, CSV com acento (nome de
  // categoria/produto em pt-BR quase sempre tem) vira mojibake — "Pão" saía
  // "PÃ£o". XLSX binário não é afetado (tem encoding próprio declarado no
  // arquivo); achado testando um CSV de verdade com acento antes de escrever
  // os testes.
  const workbook = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });

  return rows.map((row, index) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.trim().toLowerCase()] = String(value ?? '').trim();
    }
    return {
      line: index + 1,
      categoria: normalized.categoria ?? '',
      produto: normalized.produto ?? '',
      descricao: normalized.descricao ?? '',
      preco: normalized.preco ?? '',
      disponivel: normalized.disponivel ?? '',
    };
  });
}
