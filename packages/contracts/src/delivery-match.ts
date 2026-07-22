/**
 * Contrato do match de zona de entrega — `POST /v1/store/:slug/delivery-match`
 * (Épico 6).
 *
 * Segunda rota pública sem autenticação do storefront (a primeira é `GET
 * /v1/store/:slug`, ver `storefront.ts`) — por isso é `POST`, não `GET`: o
 * dado de entrada (lat/lng do cliente) é dado pessoal de localização, não
 * pertence numa query string (nunca em URL, CLAUDE.md §Privacidade).
 *
 * Responde só com o que o cliente PRECISA saber pra decidir se compra —
 * nunca o polígono da zona nem `store_id`/`tenant_id`: um endpoint que
 * revela geometria de cobertura é, por si, uma superfície de scraping (quem
 * varre coordenadas mapeia a zona inteira) — não é segredo grave, mas
 * também não precisa ser de graça. Rate limit por IP, mesmo padrão do
 * catálogo público.
 *
 * Zonas podem se sobrepor (zona premium menor dentro de uma maior, preço
 * diferente) — o backend devolve a de menor `priority` que contém o ponto;
 * o cliente nunca vê as outras.
 */

import { z } from 'zod';

export const deliveryMatchRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const deliveryMatchResponseSchema = z.discriminatedUnion('withinZone', [
  z.object({
    withinZone: z.literal(true),
    zoneName: z.string(),
    feeCents: z.int().nonnegative(),
    etaMinMinutes: z.int().nonnegative(),
    etaMaxMinutes: z.int().nonnegative(),
  }),
  z.object({
    withinZone: z.literal(false),
  }),
]);

export type DeliveryMatchRequest = z.infer<typeof deliveryMatchRequestSchema>;
export type DeliveryMatchResponse = z.infer<typeof deliveryMatchResponseSchema>;
