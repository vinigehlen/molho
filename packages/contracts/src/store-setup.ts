import { z } from 'zod';

export const pixKeyTypeSchema = z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']);

export const storeSetupSchema = z.strictObject({
  id: z.uuid(),
  tenantId: z.uuid(),
  /** Slug ATUAL do tenant (= domínio, `molho.live/<slug>`) — sincronizado
   * com `name` a cada save (decisão de produto pré-lançamento: nome fantasia
   * e domínio nunca divergem). Front usa pra atualizar a sessão local sem
   * precisar de novo login. */
  tenantSlug: z.string(),
  cnpj: z.string().nullable(),
  ownerName: z.string().nullable(),
  name: z.string(),
  addressText: z.string(),
  phone: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  minOrderCents: z.int().nonnegative(),
  pixKey: z.string().nullable(),
  pixKeyType: pixKeyTypeSchema.nullable(),
  pixMerchantCity: z.string().nullable(),
  timezone: z.string(),
});

export const updateStoreSetupSchema = z.strictObject({
  cnpj: z
    .string()
    .trim()
    .regex(/^(\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/, 'CNPJ inválido.')
	  .nullable()
	  .optional(),
  ownerName: z.string().trim().min(2).max(120).nullable().optional(),
  name: z.string().trim().min(2).max(80),
  addressText: z.string().trim().min(5).max(240),
  phone: z.string().trim().max(32).nullable(),
  whatsappNumber: z.string().trim().max(32).nullable(),
  minOrderCents: z.int().nonnegative(),
  pixKey: z.string().trim().max(120).nullable(),
  pixKeyType: pixKeyTypeSchema.nullable(),
  pixMerchantCity: z.string().trim().min(1).max(15).nullable(),
});

export type StoreSetup = z.infer<typeof storeSetupSchema>;
export type UpdateStoreSetupInput = z.infer<typeof updateStoreSetupSchema>;
