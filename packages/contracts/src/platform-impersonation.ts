/**
 * Contrato de impersonation do super-admin (Épico 14, docs/01 §5-C.1) — "o
 * recurso mais perigoso da plataforma": motivo escrito obrigatório, expira em
 * 30min (`MAX_IMPERSONATION_MINUTES`, espelhado no backend), somente-leitura
 * por padrão. `readOnly: false` exige justificativa mais longa de propósito
 * (uso excepcional, não o caminho comum) — mesmo racional de exigir MAIS
 * atrito pra ação MAIS perigosa.
 */

import { z } from 'zod';

export const MAX_IMPERSONATION_MINUTES = 30;

export const startImpersonationSchema = z
  .object({
    reason: z.string().trim().min(10).max(500),
    readOnly: z.boolean().default(true),
  })
  .refine((input) => input.readOnly || input.reason.length >= 30, {
    message: 'Impersonation com escrita exige um motivo mais detalhado (mínimo 30 caracteres).',
    path: ['reason'],
  });
export type StartImpersonationInput = z.infer<typeof startImpersonationSchema>;

export const impersonationSessionResponseSchema = z.strictObject({
  accessToken: z.string(),
  tenantId: z.uuid(),
  tenantSlug: z.string(),
  tenantName: z.string(),
  readOnly: z.boolean(),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type ImpersonationSessionResponse = z.infer<typeof impersonationSessionResponseSchema>;
