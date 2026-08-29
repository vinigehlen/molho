import { z } from 'zod';

const centsSchema = z.int().nonnegative();
const versionSchema = z.int().nonnegative();
const sortOrderSchema = z.int();

export const catalogCategorySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  sortOrder: sortOrderSchema,
  visible: z.boolean(),
  version: versionSchema,
});

export const createCatalogCategorySchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  sortOrder: sortOrderSchema.optional(),
  visible: z.boolean().optional(),
});

export const updateCatalogCategorySchema = z.strictObject({
  version: versionSchema,
  name: z.string().trim().min(1).max(80).optional(),
  sortOrder: sortOrderSchema.optional(),
  visible: z.boolean().optional(),
});

const pdvCodeSchema = z.string().trim().max(60).nullable();

export const catalogProductSchema = z.strictObject({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  basePriceCents: centsSchema,
  imageKey: z.string().nullable(),
  available: z.boolean(),
  /** Código do item no PDV do lojista — texto livre opcional, nunca
   * interpretado por nós (exceção MVP 2026-08-28, CLAUDE.md). */
  pdvCode: pdvCodeSchema,
  sortOrder: sortOrderSchema,
  version: versionSchema,
});

export const createCatalogProductSchema = z.strictObject({
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  basePriceCents: centsSchema,
  pdvCode: pdvCodeSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const updateCatalogProductSchema = z.strictObject({
  version: versionSchema,
  categoryId: z.uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  basePriceCents: centsSchema.optional(),
  pdvCode: pdvCodeSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const setCatalogProductAvailabilitySchema = z.strictObject({
  version: versionSchema,
  available: z.boolean(),
});

/** Apresentação comercial de um produto numa categoria. Durante a expansão
 * do Épico 4B toda linha existente é `isPrimary=true` e permanece sincronizada
 * com os campos legados de Product para deploy sem downtime. */
export const catalogProductOfferSchema = z.strictObject({
  id: z.uuid(),
  productId: z.uuid(),
  categoryId: z.uuid(),
  priceCents: centsSchema,
  available: z.boolean(),
  pdvCode: pdvCodeSchema,
  sortOrder: sortOrderSchema,
  isPrimary: z.boolean(),
  version: versionSchema,
});

/** Não cria ofertas secundárias ainda: este contrato só edita a oferta
 * compatível que já nasceu no backfill. */
export const updateCatalogProductOfferSchema = z.strictObject({
  version: versionSchema,
  categoryId: z.uuid().optional(),
  priceCents: centsSchema.optional(),
  pdvCode: pdvCodeSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const setCatalogProductOfferAvailabilitySchema = z.strictObject({
  version: versionSchema,
  available: z.boolean(),
});

export const catalogModifierGroupSchema = z.strictObject({
  id: z.uuid(),
  productId: z.uuid(),
  name: z.string(),
  min: z.int().nonnegative(),
  max: z.int().nonnegative(),
  /** Pausado = continua existindo (histórico de pedido não quebra), some
   * pro cliente escolher — mesma ideia do produto "esgotado". */
  active: z.boolean(),
  pdvCode: pdvCodeSchema,
  version: versionSchema,
});

export const createCatalogModifierGroupSchema = z.strictObject({
  productId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  min: z.int().nonnegative().optional(),
  max: z.int().nonnegative().optional(),
  pdvCode: pdvCodeSchema.optional(),
});

export const updateCatalogModifierGroupSchema = z.strictObject({
  version: versionSchema,
  name: z.string().trim().min(1).max(80).optional(),
  min: z.int().nonnegative().optional(),
  max: z.int().nonnegative().optional(),
  active: z.boolean().optional(),
  pdvCode: pdvCodeSchema.optional(),
});

export const catalogModifierSchema = z.strictObject({
  id: z.uuid(),
  groupId: z.uuid(),
  name: z.string(),
  priceDeltaCents: centsSchema,
  version: versionSchema,
});

export const createCatalogModifierSchema = z.strictObject({
  groupId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  priceDeltaCents: centsSchema,
});

export const updateCatalogModifierSchema = z.strictObject({
  version: versionSchema,
  name: z.string().trim().min(1).max(80).optional(),
  priceDeltaCents: centsSchema.optional(),
});

export const catalogProductImageSchema = z.strictObject({
  id: z.uuid(),
  productId: z.uuid(),
  imageKey: z.string(),
  position: z.int().nonnegative(),
  version: versionSchema,
});

export const addCatalogProductImageSchema = z.strictObject({
  imageKey: z.string().trim().min(1),
  position: z.int().nonnegative().optional(),
});

export const updateCatalogProductImageSchema = z.strictObject({
  version: versionSchema,
  position: z.int().nonnegative().optional(),
});

export type CatalogCategory = z.infer<typeof catalogCategorySchema>;
export type CreateCatalogCategoryInput = z.infer<typeof createCatalogCategorySchema>;
export type UpdateCatalogCategoryInput = z.infer<typeof updateCatalogCategorySchema>;
export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type CreateCatalogProductInput = z.infer<typeof createCatalogProductSchema>;
export type UpdateCatalogProductInput = z.infer<typeof updateCatalogProductSchema>;
export type SetCatalogProductAvailabilityInput = z.infer<
  typeof setCatalogProductAvailabilitySchema
>;
export type CatalogProductOffer = z.infer<typeof catalogProductOfferSchema>;
export type UpdateCatalogProductOfferInput = z.infer<typeof updateCatalogProductOfferSchema>;
export type SetCatalogProductOfferAvailabilityInput = z.infer<
  typeof setCatalogProductOfferAvailabilitySchema
>;
export type CatalogModifierGroup = z.infer<typeof catalogModifierGroupSchema>;
export type CreateCatalogModifierGroupInput = z.infer<typeof createCatalogModifierGroupSchema>;
export type UpdateCatalogModifierGroupInput = z.infer<typeof updateCatalogModifierGroupSchema>;
export type CatalogModifier = z.infer<typeof catalogModifierSchema>;
export type CreateCatalogModifierInput = z.infer<typeof createCatalogModifierSchema>;
export type UpdateCatalogModifierInput = z.infer<typeof updateCatalogModifierSchema>;
export type CatalogProductImage = z.infer<typeof catalogProductImageSchema>;
export type AddCatalogProductImageInput = z.infer<typeof addCatalogProductImageSchema>;
export type UpdateCatalogProductImageInput = z.infer<typeof updateCatalogProductImageSchema>;
