import { z } from 'zod';

const centsSchema = z.int();

export const analyticsFulfillmentSchema = z.enum(['delivery', 'pickup', 'balcao']);
export const analyticsGranularitySchema = z.enum(['day', 'month']);
export const analyticsTopItemsSortSchema = z.enum(['qty', 'revenue']);

export const analyticsOverviewSchema = z.object({
  realizado: z.object({
    faturamentoCents: centsSchema.nonnegative(),
    pedidos: z.int().nonnegative(),
    ticketMedioCents: centsSchema.nonnegative(),
  }),
  emAberto: z.object({
    faturamentoCents: centsSchema.nonnegative(),
    pedidos: z.int().nonnegative(),
  }),
  fulfillment: z.array(
    z.object({
      tipo: analyticsFulfillmentSchema,
      pedidos: z.int().nonnegative(),
      faturamentoCents: centsSchema.nonnegative(),
    }),
  ),
});

export const analyticsTimeseriesPointSchema = z.object({
  bucket: z.string(),
  faturamentoCents: centsSchema.nonnegative(),
  pedidos: z.int().nonnegative(),
});

export const analyticsPeakHourSchema = z.object({
  dow: z.int().min(0).max(6),
  hour: z.int().min(0).max(23),
  pedidos: z.int().nonnegative(),
  faturamentoCents: centsSchema.nonnegative(),
});

export const analyticsTopItemSchema = z.object({
  productId: z.uuid(),
  nome: z.string(),
  unidades: z.int().nonnegative(),
  faturamentoCents: centsSchema.nonnegative(),
});

export const analyticsCustomerSchema = z.object({
  customerId: z.uuid(),
  nomeMascarado: z.string().nullable(),
  telefoneMascarado: z.string().nullable(),
  pedidos: z.int().nonnegative(),
  faturamentoCents: centsSchema.nonnegative(),
});

export const analyticsRegionSchema = z.object({
  cityKey: z.string().nullable(),
  cidade: z.string(),
  uf: z.string().nullable(),
  pedidos: z.int().nonnegative(),
  faturamentoCents: centsSchema.nonnegative(),
});

export const analyticsIdleItemSchema = z.object({
  productId: z.uuid(),
  nome: z.string(),
  categoria: z.string(),
});

export type AnalyticsFulfillment = z.infer<typeof analyticsFulfillmentSchema>;
export type AnalyticsGranularity = z.infer<typeof analyticsGranularitySchema>;
export type AnalyticsTopItemsSort = z.infer<typeof analyticsTopItemsSortSchema>;
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;
export type AnalyticsTimeseriesPoint = z.infer<typeof analyticsTimeseriesPointSchema>;
export type AnalyticsPeakHour = z.infer<typeof analyticsPeakHourSchema>;
export type AnalyticsTopItem = z.infer<typeof analyticsTopItemSchema>;
export type AnalyticsCustomer = z.infer<typeof analyticsCustomerSchema>;
export type AnalyticsRegion = z.infer<typeof analyticsRegionSchema>;
export type AnalyticsIdleItem = z.infer<typeof analyticsIdleItemSchema>;
