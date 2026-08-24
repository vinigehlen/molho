import { z } from 'zod';

const centsSchema = z.int().nonnegative();
const versionSchema = z.int().nonnegative();
const sortOrderSchema = z.int();

export const catalogCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: sortOrderSchema,
  visible: z.boolean(),
  version: versionSchema,
});

export const createCatalogCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: sortOrderSchema.optional(),
  visible: z.boolean().optional(),
});

export const updateCatalogCategorySchema = z.object({
  version: versionSchema,
  name: z.string().trim().min(1).max(80).optional(),
  sortOrder: sortOrderSchema.optional(),
  visible: z.boolean().optional(),
});

export const catalogProductSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  basePriceCents: centsSchema,
  imageKey: z.string().nullable(),
  available: z.boolean(),
  sortOrder: sortOrderSchema,
  version: versionSchema,
});

export const createCatalogProductSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  basePriceCents: centsSchema,
  sortOrder: sortOrderSchema.optional(),
});

export const updateCatalogProductSchema = z.object({
  version: versionSchema,
  categoryId: z.uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  basePriceCents: centsSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const setCatalogProductAvailabilitySchema = z.object({
  version: versionSchema,
  available: z.boolean(),
});

export const catalogModifierGroupSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  name: z.string(),
  min: z.int().nonnegative(),
  max: z.int().nonnegative(),
  version: versionSchema,
});

export const createCatalogModifierGroupSchema = z.object({
  productId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  min: z.int().nonnegative().optional(),
  max: z.int().nonnegative().optional(),
});

export const updateCatalogModifierGroupSchema = z.object({
  version: versionSchema,
  name: z.string().trim().min(1).max(80).optional(),
  min: z.int().nonnegative().optional(),
  max: z.int().nonnegative().optional(),
});

export const catalogModifierSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  name: z.string(),
  priceDeltaCents: centsSchema,
  version: versionSchema,
});

export const createCatalogModifierSchema = z.object({
  groupId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  priceDeltaCents: centsSchema,
});

export const updateCatalogModifierSchema = z.object({
  version: versionSchema,
  name: z.string().trim().min(1).max(80).optional(),
  priceDeltaCents: centsSchema.optional(),
});

export const catalogProductImageSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  imageKey: z.string(),
  position: z.int().nonnegative(),
  version: versionSchema,
});

export const addCatalogProductImageSchema = z.object({
  imageKey: z.string().trim().min(1),
  position: z.int().nonnegative().optional(),
});

export const updateCatalogProductImageSchema = z.object({
  version: versionSchema,
  position: z.int().nonnegative().optional(),
});

export type CatalogCategory = z.infer<typeof catalogCategorySchema>;
export type CreateCatalogCategoryInput = z.infer<typeof createCatalogCategorySchema>;
export type UpdateCatalogCategoryInput = z.infer<typeof updateCatalogCategorySchema>;
export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type CreateCatalogProductInput = z.infer<typeof createCatalogProductSchema>;
export type UpdateCatalogProductInput = z.infer<typeof updateCatalogProductSchema>;
export type SetCatalogProductAvailabilityInput = z.infer<typeof setCatalogProductAvailabilitySchema>;
export type CatalogModifierGroup = z.infer<typeof catalogModifierGroupSchema>;
export type CreateCatalogModifierGroupInput = z.infer<typeof createCatalogModifierGroupSchema>;
export type UpdateCatalogModifierGroupInput = z.infer<typeof updateCatalogModifierGroupSchema>;
export type CatalogModifier = z.infer<typeof catalogModifierSchema>;
export type CreateCatalogModifierInput = z.infer<typeof createCatalogModifierSchema>;
export type UpdateCatalogModifierInput = z.infer<typeof updateCatalogModifierSchema>;
export type CatalogProductImage = z.infer<typeof catalogProductImageSchema>;
export type AddCatalogProductImageInput = z.infer<typeof addCatalogProductImageSchema>;
export type UpdateCatalogProductImageInput = z.infer<typeof updateCatalogProductImageSchema>;
