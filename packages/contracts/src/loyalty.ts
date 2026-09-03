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
