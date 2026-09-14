/**
 * Contrato de gestão de lojas do tenant (multi_store, PR1 backend+admin).
 * Slug é gerado no servidor a partir do nome (mesmo padrão de
 * `slugifyStoreName`/tenant) — o lojista não digita URL, só o nome da loja.
 */

import { z } from 'zod';

export const createStoreSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  addressText: z.string().trim().min(3).max(200),
  timezone: z.string().trim().min(1).max(60).default('America/Sao_Paulo'),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const storeSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  isPrimary: z.boolean(),
  addressText: z.string(),
  timezone: z.string(),
  createdAt: z.iso.datetime(),
});
export type StoreSummary = z.infer<typeof storeSummarySchema>;

export const storeListResponseSchema = z.array(storeSummarySchema);
export type StoreListResponse = z.infer<typeof storeListResponseSchema>;
