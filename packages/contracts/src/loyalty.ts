/**
 * Fidelidade por cashback (Épico 16b). D1-D7 travadas com o PM em
 * 2026-09-02: cashback (não pontos), crédito só em `completed`, resgate
 * tudo-ou-nada, sem expiração, taxa por tenant, empilha com cupom, módulo
 * sempre ligado.
 */

import { z } from 'zod';

export const loyaltyConfigSchema = z.strictObject({
  cashbackPercent: z.int().min(1).max(100),
  version: z.int().nonnegative(),
});
export type LoyaltyConfig = z.infer<typeof loyaltyConfigSchema>;

export const updateLoyaltyConfigSchema = z.strictObject({
  version: z.int().nonnegative(),
  cashbackPercent: z.int().min(1).max(100),
});
export type UpdateLoyaltyConfigInput = z.infer<typeof updateLoyaltyConfigSchema>;

export const loyaltyBalanceSchema = z.strictObject({
  balanceCents: z.int().nonnegative(),
});
export type LoyaltyBalanceResponse = z.infer<typeof loyaltyBalanceSchema>;

/**
 * Extrato de cashback (Épico 16.1) — une `earn` (crédito ao concluir o
 * pedido, tem linha própria em `loyalty_events`) e `redeem` (resgate no
 * checkout, sem ledger próprio — `orders.cashback_used_cents` já é o
 * registro auditável, mesmo racional do cupom). `orderId` sempre aponta pro
 * pedido de origem, nos dois casos — é o link pra página de acompanhamento.
 */
export const loyaltyEventTypeSchema = z.enum(['earn', 'redeem']);
export type LoyaltyEventType = z.infer<typeof loyaltyEventTypeSchema>;

export const loyaltyEventSchema = z.strictObject({
  type: loyaltyEventTypeSchema,
  amountCents: z.int().positive(),
  orderId: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type LoyaltyEvent = z.infer<typeof loyaltyEventSchema>;

export const loyaltyEventsResponseSchema = z.strictObject({ events: z.array(loyaltyEventSchema) });
export type LoyaltyEventsResponse = z.infer<typeof loyaltyEventsResponseSchema>;
