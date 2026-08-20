/**
 * Contrato de CRUD de zona de entrega — backoffice (Épico 6). Union
 * discriminada por `kind`, espelhando o XOR do banco: uma zona é por
 * CIDADE (taxa fixa, casa por `city`+`state`) OU por POLÍGONO
 * (`geography(Polygon,4326)`, via ST_Buffer a partir do ponto da loja) —
 * nunca os dois, mesma regra do CHECK `delivery_zones_city_xor_polygon`
 * (ver `packages/db/prisma/schema.prisma`, model `DeliveryZone`).
 *
 * `createDeliveryZoneSchema` e `updateDeliveryZoneSchema` têm a MESMA
 * forma — update é replace da zona inteira, não patch parcial.
 */

import { z } from 'zod';

const centsSchema = z.int().nonnegative();

const baseZoneFields = {
  name: z.string().min(1, 'Nome não pode ser vazio'),
  feeCents: centsSchema,
  etaMinMinutes: z.int().nonnegative(),
  etaMaxMinutes: z.int().nonnegative(),
  /** Zonas sobrepostas: menor valor "vence" — checado primeiro no match. */
  priority: z.int().nonnegative().default(0),
};

/**
 * GeoJSON Polygon — só a FORMA (winding order, ring fechado etc. é
 * validação de geometria, fica pro PostGIS/`ST_IsValid` no servidor).
 * `coordinates`: 1+ anéis, cada anel com 4+ posições `[lng, lat]`.
 */
const geoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1),
});

const cityZoneSchema = z
  .object({
    kind: z.literal('city'),
    ...baseZoneFields,
    city: z.string().min(1, 'Cidade não pode ser vazia'),
    state: z
      .string()
      .regex(/^[A-Z]{2}$/, 'UF precisa ter 2 letras maiúsculas'),
  })
  .refine((data) => data.etaMaxMinutes >= data.etaMinMinutes, {
    message: 'ETA máximo precisa ser maior ou igual ao mínimo',
    path: ['etaMaxMinutes'],
  });

const polygonZoneSchema = z
  .object({
    kind: z.literal('polygon'),
    ...baseZoneFields,
    polygon: geoJsonPolygonSchema,
  })
  .refine((data) => data.etaMaxMinutes >= data.etaMinMinutes, {
    message: 'ETA máximo precisa ser maior ou igual ao mínimo',
    path: ['etaMaxMinutes'],
  });

export const createDeliveryZoneSchema = z.discriminatedUnion('kind', [cityZoneSchema, polygonZoneSchema]);
/** Update é replace da zona inteira — mesma forma do create. */
export const updateDeliveryZoneSchema = createDeliveryZoneSchema;

export const deliveryZoneResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(['city', 'polygon']),
  city: z.string().nullable(),
  state: z.string().nullable(),
  feeCents: centsSchema,
  etaMinMinutes: z.int().nonnegative(),
  etaMaxMinutes: z.int().nonnegative(),
  priority: z.int().nonnegative(),
  /** Optimistic lock — cliente envia de volta via header `If-Match` no PATCH/DELETE. */
  version: z.int().nonnegative(),
});

export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;
export type UpdateDeliveryZoneInput = z.infer<typeof updateDeliveryZoneSchema>;
export type DeliveryZoneResponse = z.infer<typeof deliveryZoneResponseSchema>;
