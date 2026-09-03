/**
 * Promoção agendada — admin (Épico 15). Desconto AUTOMÁTICO por dia da
 * semana e janela de horário local da loja, sem cupom digitado — se o
 * pedido cai dentro da janela, o desconto já vem aplicado na revalidação
 * (checkout-revalidation.service.ts). Empilha com cupom/cashback (colunas
 * independentes, mesmo racional do Épico 16b).
 *
 * Módulo `promotions` (packages/contracts/src/modules.ts) — `default: true`
 * em todo plano, mesmo padrão de coupons/combos/loyalty/reviews (decisão
 * [15-D1], 2026-09-03: PM removeu a segmentação pro/premium desses módulos).
 */

import { z } from 'zod';

export const promotionDiscountTypeSchema = z.enum(['percent', 'fixed']);
export const promotionScopeSchema = z.enum(['store_wide', 'category', 'product']);

/** 0–6, 0 = domingo — mesma convenção de DayOfWeek/store_hours (não reaproveita o enum textual porque a promoção guarda um ARRAY de dias, e o Postgres não indexa array de enum tão bem quanto array de int). */
const weekdaySchema = z.int().min(0).max(6);

/** Mesmo XOR do CHECK na migration: scope store_wide não tem alvo, category/product exigem um. */
export const createPromotionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    discountType: promotionDiscountTypeSchema,
    /** 1–100 quando percent; centavos positivos quando fixed — validado abaixo, não dá pra expressar os dois ao mesmo tempo com z.int() só. */
    discountValue: z.int().positive(),
    weekdays: z.array(weekdaySchema).min(1).max(7),
    /** "HH:MM" 24h. `endTime < startTime` = janela cruza a meia-noite (mesmo padrão de closesAtMinutes < opensAtMinutes em StoreHours) — aceito aqui, quem decide "está dentro?" é o checkout. */
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido, use HH:MM.'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido, use HH:MM.'),
    scope: promotionScopeSchema,
    scopeId: z.uuid().optional(),
  })
  .refine((v) => v.discountType !== 'percent' || v.discountValue <= 100, {
    message: 'discountType percent exige discountValue entre 1 e 100.',
  })
  .refine((v) => (v.scope === 'store_wide' ? v.scopeId === undefined : v.scopeId !== undefined), {
    // XOR de verdade — mesma exigência do CHECK promotions_scope_id_xor_check
    // na migration. Aceitar os dois combinados passaria aqui e só estouraria
    // como erro cru de constraint no INSERT (500, não 400 amigável).
    message: 'scope store_wide não aceita scopeId; category/product exigem scopeId.',
  });

export const updatePromotionSchema = z.strictObject({
  version: z.int().nonnegative(),
  name: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
  weekdays: z.array(weekdaySchema).min(1).max(7).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido, use HH:MM.').optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido, use HH:MM.').optional(),
});

export const promotionResponseSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  discountType: promotionDiscountTypeSchema,
  discountValue: z.int().positive(),
  weekdays: z.array(weekdaySchema),
  startTime: z.string(),
  endTime: z.string(),
  scope: promotionScopeSchema,
  scopeId: z.uuid().nullable(),
  active: z.boolean(),
  version: z.int().nonnegative(),
});

/** Item aplicável a uma promoção `category`/`product` — só o suficiente pro seletor de alvo no gestor (docs/03 §5, mesmo recorte de MoAddressSheet pra endereço). */
export const promotionTargetSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
});

export type PromotionDiscountType = z.infer<typeof promotionDiscountTypeSchema>;
export type PromotionScope = z.infer<typeof promotionScopeSchema>;
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
export type PromotionResponse = z.infer<typeof promotionResponseSchema>;
export type PromotionTarget = z.infer<typeof promotionTargetSchema>;
