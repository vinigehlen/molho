/**
 * Itens de combo — admin (exceção MVP 2026-08-28, CLAUDE.md — fase 4/4,
 * fatia 4.1a).
 *
 * O combo É um `Product` com `kind = 'combo'` (fase 3): nome, descrição,
 * foto e preço (na oferta primária) vivem lá. Este contrato só cobre a
 * COMPOSIÇÃO — quais produtos do catálogo vêm dentro e em que quantidade.
 *
 * Fase 4.1a: preço fixo (o da oferta do combo), sem combo aninhado, sem
 * modificador de filho, sem preço "a partir de" — tudo isso é 4.2. Gateado
 * atrás de `@RequireModule('combos')`.
 */

import { z } from 'zod';

const versionSchema = z.int().nonnegative();
const quantitySchema = z.int().positive().max(99);
const sortOrderSchema = z.int();

export const comboItemSchema = z.strictObject({
  id: z.uuid(),
  comboProductId: z.uuid(),
  childProductId: z.uuid(),
  /** Snapshot de exibição — o nome vive no `Product` filho. */
  childName: z.string(),
  quantity: quantitySchema,
  sortOrder: sortOrderSchema,
  version: versionSchema,
});

export const createComboItemSchema = z.strictObject({
  comboProductId: z.uuid(),
  childProductId: z.uuid(),
  quantity: quantitySchema.default(1),
  sortOrder: sortOrderSchema.optional(),
});

export const updateComboItemSchema = z.strictObject({
  version: versionSchema,
  quantity: quantitySchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type ComboItem = z.infer<typeof comboItemSchema>;
export type CreateComboItemInput = z.infer<typeof createComboItemSchema>;
export type UpdateComboItemInput = z.infer<typeof updateComboItemSchema>;
