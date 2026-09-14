/**
 * Contrato do painel de equipe (V1, escopo tenant) — dono/manager gerencia o
 * PRÓPRIO staff. Diferente de provision-staff.ts (rota super-admin,
 * scopeType tenant|store, qualquer role não-platform): aqui é sempre
 * scopeType='tenant', scopeId=tenant do ator, e role restrita a TEAM_ROLES
 * — nem platform_*, nem franchisor_* (escopo franchise, feature separada),
 * nem customer. Multi-loja (scopeType='store') fica pro módulo multi_store
 * (Fase 3/Premium, docs/01-plano-produto.md) — reusa o mesmo schema, não é
 * retrofit desta rota.
 */

import { z } from 'zod';

export const TEAM_ROLES = [
  'owner',
  'manager',
  'cashier',
  'waiter',
  'kitchen',
  'courier',
  'accountant',
  'marketing',
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

/** Papéis que um `manager` (subordinatesOnly) pode atribuir/revogar — nunca owner ou outro manager. */
export const TEAM_SUBORDINATE_ROLES = TEAM_ROLES.filter((r) => r !== 'owner' && r !== 'manager');

export const inviteTeamMemberSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(3).max(254),
  role: z.enum(TEAM_ROLES),
});
export type InviteTeamMemberInput = z.infer<typeof inviteTeamMemberSchema>;

export const updateTeamMemberRoleSchema = z.object({
  role: z.enum(TEAM_ROLES),
});
export type UpdateTeamMemberRoleInput = z.infer<typeof updateTeamMemberRoleSchema>;

export const teamMemberSchema = z.strictObject({
  userId: z.uuid(),
  name: z.string(),
  role: z.enum(TEAM_ROLES),
  createdAt: z.iso.datetime(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamListResponseSchema = z.array(teamMemberSchema);
export type TeamListResponse = z.infer<typeof teamListResponseSchema>;
