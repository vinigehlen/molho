import { z } from 'zod';

const centsSchema = z.int();

export const cmvStatusSchema = z.enum(['verde', 'amarelo', 'vermelho', 'sem_ficha']);
export const cmvEngineeringQuadrantSchema = z.enum(['estrela', 'cavalo_de_batalha', 'oportunidade', 'item_critico', 'sem_dados']);

export const cmvKpiSchema = z.strictObject({
  receitaLiquidaCents: centsSchema.nonnegative(),
  cmvTeoricoCents: centsSchema.nonnegative(),
  cmvTeoricoPercent: z.number().nonnegative(),
  margemBrutaCents: centsSchema,
  margemBrutaPercent: z.number(),
  contribuicaoCents: centsSchema,
  contribuicaoPercent: z.number(),
  pedidos: z.int().nonnegative(),
  ticketMedioCents: centsSchema.nonnegative(),
  produtosSemFicha: z.int().nonnegative(),
  custosEstimados: z.int().nonnegative(),
});

export const cmvTimeseriesPointSchema = z.strictObject({
  bucket: z.string(),
  receitaLiquidaCents: centsSchema.nonnegative(),
  cmvTeoricoCents: centsSchema.nonnegative(),
  margemBrutaCents: centsSchema,
  cmvTeoricoPercent: z.number().nonnegative(),
});

export const cmvProductRankingItemSchema = z.strictObject({
  productId: z.uuid(),
  nome: z.string(),
  categoria: z.string(),
  vendidos: z.int().nonnegative(),
  receitaLiquidaCents: centsSchema.nonnegative(),
  cmvUnitarioCents: centsSchema.nonnegative().nullable(),
  cmvTotalCents: centsSchema.nonnegative(),
  cmvPercent: z.number().nonnegative(),
  margemUnitariaCents: centsSchema.nullable(),
  contribuicaoCents: centsSchema,
  mixPercent: z.number().nonnegative(),
  status: cmvStatusSchema,
  quadrant: cmvEngineeringQuadrantSchema,
  hasRecipe: z.boolean(),
  isEstimated: z.boolean(),
});

export const cmvIngredientSchema = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  categoria: z.string(),
  unidadeBase: z.string(),
  custoAtualCents: centsSchema.nonnegative(),
  rendimentoPercent: z.number().positive(),
  ultimaAtualizacao: z.string().nullable(),
  produtosAfetados: z.int().nonnegative(),
  isTestData: z.boolean(),
});

export const cmvRecipeComponentSchema = z.strictObject({
  nome: z.string(),
  tipo: z.enum(['ingredient', 'recipe']),
  quantidade: z.number().positive(),
  unidade: z.string(),
  custoUnitarioCents: centsSchema.nonnegative(),
  custoTotalCents: centsSchema.nonnegative(),
  perdaPercent: z.number().nonnegative(),
  estimated: z.boolean(),
});

export const cmvRecipeSummarySchema = z.strictObject({
  recipeId: z.uuid(),
  productId: z.uuid().nullable(),
  nome: z.string(),
  tipo: z.enum(['MENU_ITEM', 'SUB_RECIPE']),
  custoTotalCents: centsSchema.nonnegative(),
  components: z.array(cmvRecipeComponentSchema),
  isTestData: z.boolean(),
});

export const cmvDashboardSchema = z.strictObject({
  kpis: cmvKpiSchema,
  timeseries: z.array(cmvTimeseriesPointSchema),
  ranking: z.array(cmvProductRankingItemSchema),
});

export type CmvStatus = z.infer<typeof cmvStatusSchema>;
export type CmvEngineeringQuadrant = z.infer<typeof cmvEngineeringQuadrantSchema>;
export type CmvKpi = z.infer<typeof cmvKpiSchema>;
export type CmvTimeseriesPoint = z.infer<typeof cmvTimeseriesPointSchema>;
export type CmvProductRankingItem = z.infer<typeof cmvProductRankingItemSchema>;
export type CmvIngredient = z.infer<typeof cmvIngredientSchema>;
export type CmvRecipeComponent = z.infer<typeof cmvRecipeComponentSchema>;
export type CmvRecipeSummary = z.infer<typeof cmvRecipeSummarySchema>;
export type CmvDashboard = z.infer<typeof cmvDashboardSchema>;
