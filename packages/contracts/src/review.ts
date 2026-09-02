/**
 * Avaliação do pedido (Épico 16). D1-D4 travadas com o PM em 2026-09-02:
 * imutável do lado do cliente (só cria, nunca edita/apaga), lojista responde
 * publicamente (uma resposta), módulo sempre ligado, storefront mostra só
 * nota média + contagem (sem lista individual por ora).
 */

import { z } from 'zod';

export const createReviewSchema = z.strictObject({
  rating: z.int().min(1).max(5),
  comment: z.string().trim().min(1).max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const replyReviewSchema = z.strictObject({
  version: z.int().nonnegative(),
  reply: z.string().trim().min(1).max(1000),
});
export type ReplyReviewInput = z.infer<typeof replyReviewSchema>;

export const reviewResponseSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  rating: z.int(),
  comment: z.string().nullable(),
  reply: z.string().nullable(),
  repliedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  version: z.int().nonnegative(),
});
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

/** Agregado público — o que o storefront mostra hoje (D4: sem lista individual). */
export const reviewsSummarySchema = z.strictObject({
  average: z.number().min(1).max(5).nullable(),
  count: z.int().nonnegative(),
});
export type ReviewsSummary = z.infer<typeof reviewsSummarySchema>;
