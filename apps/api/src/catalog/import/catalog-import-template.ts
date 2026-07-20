import * as XLSX from 'xlsx';

const HEADERS = ['categoria', 'produto', 'descricao', 'preco', 'disponivel'];
const EXAMPLE_ROW = ['Lanches', 'X-Burger', 'Pão, carne, queijo e salada', '24,90', 'sim'];

/** Template baixável do wizard (docs/03-self-setup.md §3, passo 3) — cabeçalho + 1 linha de exemplo. */
export function buildImportTemplate(): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, EXAMPLE_ROW]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Cardápio');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
