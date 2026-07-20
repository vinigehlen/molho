import type { CategoryService } from '../category.service';
import type { ProductService } from '../product.service';
import { parseImportFile } from './catalog-import-parser';
import { validateImportRow } from './catalog-import-row.validator';

export interface ImportRowReport {
  line: number;
  categoria: string;
  produto: string;
  status: 'valid' | 'error' | 'created';
  error?: string;
  productId?: string;
}

export interface ImportSummary {
  totalRows: number;
  createdCount: number;
  errorCount: number;
  rows: ImportRowReport[];
}

/**
 * preview() nunca grava — só parse + validação, pro passo "corrigir erros
 * linha a linha" do wizard (docs/03-self-setup.md §3). commit() grava as
 * linhas válidas e PULA (não aborta) as inválidas: 78 de 80 produtos válidos
 * já entram, os 2 com erro ficam reportados pro lojista corrigir e reenviar
 * só essas — decisão confirmada antes de codar (tudo-ou-nada foi descartado).
 *
 * Categoria é casada por NOME (case-insensitive) dentro do import inteiro —
 * um Map local evita relê banco/recriar categoria pra cada linha do mesmo
 * nome dentro do mesmo arquivo.
 */
export class CatalogImportService {
  constructor(
    private readonly categories: CategoryService,
    private readonly products: ProductService,
  ) {}

  preview(buffer: Buffer): ImportSummary {
    const rows = parseImportFile(buffer).map(validateImportRow);
    const reports: ImportRowReport[] = rows.map((row) => ({
      line: row.line,
      categoria: row.categoria,
      produto: row.produto,
      status: row.error ? 'error' : 'valid',
      error: row.error,
    }));
    return this.summarize(reports, 'valid');
  }

  async commit(buffer: Buffer): Promise<ImportSummary> {
    const rows = parseImportFile(buffer).map(validateImportRow);
    const categoryIdByName = new Map<string, string>();

    const reports: ImportRowReport[] = [];
    for (const row of rows) {
      if (row.error) {
        reports.push({ line: row.line, categoria: row.categoria, produto: row.produto, status: 'error', error: row.error });
        continue;
      }

      try {
        const categoryId = await this.resolveCategoryId(row.categoria, categoryIdByName);
        const product = await this.products.create({
          categoryId,
          name: row.produto,
          description: row.descricao || undefined,
          basePriceCents: row.basePriceCents,
        });
        if (!row.available) {
          await this.products.setAvailable(product.id, product.version, false);
        }
        reports.push({
          line: row.line,
          categoria: row.categoria,
          produto: row.produto,
          status: 'created',
          productId: product.id,
        });
      } catch (error) {
        reports.push({
          line: row.line,
          categoria: row.categoria,
          produto: row.produto,
          status: 'error',
          error: error instanceof Error ? error.message : 'Erro desconhecido ao importar esta linha.',
        });
      }
    }

    return this.summarize(reports, 'created');
  }

  private async resolveCategoryId(name: string, cache: Map<string, string>): Promise<string> {
    const key = name.trim().toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;

    const existing = await this.categories.getByName(name);
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }

    const created = await this.categories.create({ name: name.trim() });
    cache.set(key, created.id);
    return created.id;
  }

  private summarize(rows: ImportRowReport[], successStatus: 'valid' | 'created'): ImportSummary {
    return {
      totalRows: rows.length,
      createdCount: rows.filter((r) => r.status === successStatus).length,
      errorCount: rows.filter((r) => r.status === 'error').length,
      rows,
    };
  }
}
