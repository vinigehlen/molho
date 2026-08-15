/**
 * Contrato de provisionamento de staff pelo super-admin (Épico 14.3) — é
 * aqui que a criação de staff renasce: o OTP de staff (Épico 9c) NUNCA cria
 * User/user_role (ver staff-identity.repository.ts na API), então sem este
 * endpoint não existe caminho pra dar o primeiro papel a ninguém fora do
 * seed.
 *
 * `scopeType` só aceita 'tenant'|'store' de propósito — escopo 'platform'
 * (papéis platform_* e platform.superadmin) NUNCA nasce por aqui, só pelo
 * seed (packages/db/prisma/seed/superadmin.ts). A união restrita já barra
 * estruturalmente qualquer role que só faz sentido em escopo platform: o
 * `refine` abaixo é defesa em profundidade, não a única barreira.
 */

import { z } from 'zod';
import { ROLES } from './permissions';

export const provisionStaffScopeTypeSchema = z.enum(['tenant', 'store']);

export const provisionStaffSchema = z
  .object({
    email: z.string().trim().min(3).max(254),
    role: z.enum(ROLES),
    scopeType: provisionStaffScopeTypeSchema,
    scopeId: z.uuid(),
  })
  .refine((input) => !input.role.startsWith('platform'), {
    message: 'Papéis platform_* e platform.superadmin não se atribuem por este endpoint.',
    path: ['role'],
  });

export type ProvisionStaffInput = z.infer<typeof provisionStaffSchema>;

export const provisionStaffResponseSchema = z.object({
  userId: z.uuid(),
  role: z.enum(ROLES),
  scopeType: provisionStaffScopeTypeSchema,
  scopeId: z.uuid(),
  created: z.boolean(),
});

export type ProvisionStaffResponse = z.infer<typeof provisionStaffResponseSchema>;
