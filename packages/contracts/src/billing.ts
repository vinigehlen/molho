/**
 * Assinatura do tenant (Épico 13d) — decisão do PM (CLAUDE.md, 2026-09-04):
 * cobrança MANUAL no piloto (PIX/boleto na mão), sem PSP recorrente ainda
 * (isso só entra nos épicos 24-26). O que este épico entrega é o CICLO DE
 * VIDA da assinatura — trial expira sozinho, atraso vira suspensão depois
 * de uma folga, cancelamento em 2 cliques — a cobrança em si continua sendo
 * o super-admin confirmando "recebi o PIX" na mão.
 *
 * `trial → active → past_due → suspended` é uma linha só; `canceled` é
 * alcançável de qualquer estado não-terminal (o lojista desiste a qualquer
 * momento). `suspended` só sai por ação manual do super-admin (marcar
 * pago) — nunca se autocura sozinho, é dinheiro de verdade em jogo.
 */

import { z } from 'zod';

export const subscriptionStatusSchema = z.enum(['trial', 'active', 'past_due', 'suspended', 'canceled']);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionResponseSchema = z.strictObject({
  status: subscriptionStatusSchema,
  planId: z.string().nullable(),
  trialEndsAt: z.iso.datetime().nullable(),
  currentPeriodEndsAt: z.iso.datetime().nullable(),
  pastDueAt: z.iso.datetime().nullable(),
  canceledAt: z.iso.datetime().nullable(),
});
export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;

/** Super-admin confirma que o PIX/boleto caiu — nunca automático. */
export const markSubscriptionPaidSchema = z.strictObject({
  /** Duração do novo período — default 30 (mensal). Não trava em 30 fixo: piloto pode negociar ciclo diferente. */
  periodDays: z.int().min(1).max(366).default(30),
});
export type MarkSubscriptionPaidInput = z.infer<typeof markSubscriptionPaidSchema>;
