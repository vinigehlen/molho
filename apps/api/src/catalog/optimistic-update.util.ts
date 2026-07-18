import { CatalogConflictError, CatalogNotFoundError } from './catalog-errors';

/**
 * `updateMany`/soft-delete com `WHERE id = :id AND version = :expected` só
 * diz QUANTAS linhas mudaram, nunca POR QUE zero mudou (CLAUDE.md § Optimistic
 * locking) — id inexistente e version desatualizada dão o mesmo count=0. As
 * 4 tabelas de catálogo precisam distinguir os dois pra devolver 404 vs 409
 * corretos, daí este helper: só faz o SELECT extra quando updatedCount é 0.
 */
export async function assertOptimisticUpdate(
  entity: string,
  updatedCount: number,
  checkStillExists: () => Promise<boolean>,
): Promise<void> {
  if (updatedCount > 0) return;
  const exists = await checkStillExists();
  throw exists ? new CatalogConflictError(entity) : new CatalogNotFoundError(entity);
}
