import { apiFetch } from './api-client';

/**
 * Client isolado da experiência assistida de importação (fatia 13C.1).
 * NÃO reusa `catalog-api.ts` de propósito: aquele client faz commit cego
 * (a partir da página de cardápio). Aqui o fluxo é preview → revisão →
 * consentimento → commit, e o formato de resposta (`ImportSummary`) é
 * próprio do endpoint de import, não do CRUD de catálogo.
 *
 * O `ImportSummary` espelha o retorno de `CatalogImportService`
 * (apps/api/src/catalog/import/catalog-import.service.ts) — o endpoint
 * devolve o objeto direto, sem schema em `@molho/contracts`.
 */

export type ImportRowStatus = 'valid' | 'error' | 'created';

export interface ImportRowReport {
  line: number;
  categoria: string;
  produto: string;
  status: ImportRowStatus;
  error?: string;
  productId?: string;
}

export interface ImportSummary {
  totalRows: number;
  /** No preview: linhas válidas. No commit: linhas criadas. */
  createdCount: number;
  errorCount: number;
  rows: ImportRowReport[];
}

function importForm(file: File): FormData {
  const body = new FormData();
  body.set('file', file);
  return body;
}

async function readSummary(res: Response, acao: string): Promise<ImportSummary> {
  if (!res.ok) {
    // O endpoint responde a mensagem pt-BR em `message` pra 400 de formato/parse.
    const detalhe = await res
      .json()
      .then((body: { message?: string }) => body?.message)
      .catch(() => undefined);
    throw new Error(detalhe ?? `Falha ao ${acao} a planilha (${res.status}).`);
  }
  return (await res.json()) as ImportSummary;
}

/** Só faz parse + validação no servidor — nunca grava. */
export async function previewCatalogImport(file: File): Promise<ImportSummary> {
  const res = await apiFetch('/v1/admin/catalog/import/preview', { method: 'POST', body: importForm(file) });
  return readSummary(res, 'analisar');
}

/**
 * Grava as linhas válidas e PULA as com erro (commit parcial — decisão
 * travada no serviço). Só deve ser chamado após consentimento explícito.
 */
export async function commitCatalogImport(file: File): Promise<ImportSummary> {
  const res = await apiFetch('/v1/admin/catalog/import/commit', { method: 'POST', body: importForm(file) });
  return readSummary(res, 'importar');
}
