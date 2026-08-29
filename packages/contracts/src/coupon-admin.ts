/**
 * Cupom de desconto — admin (Épico conversão, C2). v1 ENXUTO
 * (docs/handoff-features-conversao-gestor.md A2): só percentual/fixo, valor
 * mínimo, validade e limite total de usos. Fora do v1: limite por cliente,
 * janela de horário, primeira-compra.
 *
 * Módulo `coupons` (packages/contracts/src/modules.ts) — Fase 2 no roadmap
 * original (CLAUDE.md lista "cupons" em "Fora do MVP"), mas o handoff pediu
 * o v1 agora; entra GATEADO atrás de `@RequireModule('coupons')` (plans
 * pro/premium) — inerte pra qualquer tenant no plano do MVP, mesmo
 * princípio de "módulo desligado é não-destrutivo" (CLAUDE.md regra 1).
 */

import { z } from 'zod';

const centsSchema = z.int().positive();

export const couponDiscountTypeSchema = z.enum(['percent', 'fixed']);

/** Mesmo XOR do CHECK na migration: percent exige discountPercent, fixed exige discountValueCents. */
export const createCouponSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    discountType: couponDiscountTypeSchema,
    discountPercent: z.int().min(1).max(100).optional(),
    discountValueCents: centsSchema.optional(),
    minOrderCents: z.int().nonnegative().default(0),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    maxUses: z.int().positive(),
  })
  .refine(
    (v) =>
      v.discountType === 'percent'
        ? v.discountPercent !== undefined && v.discountValueCents === undefined
        : v.discountValueCents !== undefined && v.discountPercent === undefined,
    {
      // XOR de verdade — mesma exigência do CHECK coupons_discount_value_xor_check
      // na migration. Aceitar os dois setados passaria aqui e só estouraria
      // como erro cru de constraint no INSERT (500, não 400 amigável).
      message: 'discountType percent exige SÓ discountPercent; fixed exige SÓ discountValueCents.',
    },
  )
  .refine((v) => new Date(v.startsAt) < new Date(v.endsAt), {
    message: 'startsAt precisa ser antes de endsAt.',
  });

export const updateCouponSchema = z.strictObject({
  version: z.int().nonnegative(),
  active: z.boolean().optional(),
  minOrderCents: z.int().nonnegative().optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  maxUses: z.int().positive().optional(),
});

export const couponResponseSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  discountType: couponDiscountTypeSchema,
  discountPercent: z.int().nullable(),
  discountValueCents: z.int().nullable(),
  minOrderCents: z.int().nonnegative(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  maxUses: z.int().positive(),
  usesCount: z.int().nonnegative(),
  active: z.boolean(),
  version: z.int().nonnegative(),
});

export type CouponDiscountType = z.infer<typeof couponDiscountTypeSchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type CouponResponse = z.infer<typeof couponResponseSchema>;
