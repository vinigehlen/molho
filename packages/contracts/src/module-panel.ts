/**
 * Contrato do painel de módulos do super-admin (Épico 14.4) — conceder/
 * revogar entitlement de um módulo NÃO-core por tenant. `moduleKey` em si
 * não tem schema próprio aqui: o controller valida com `isModuleKey()` do
 * registry (packages/contracts/src/modules.ts), porque o valor vem da URL
 * (`:moduleKey`), não do body.
 *
 * `status` usa o vocabulário do PAINEL ('active'|'trial'|'revoked'), mais
 * claro pro super-admin que o enum de banco (EntitlementStatus do Prisma:
 * active/trialing/suspended) — a camada de API traduz um pro outro.
 * `revoked` ↔ `suspended`: ModuleService já trata `suspended` como "não
 * entitled" (packages/db/src/modules/module-service.ts), então revogar é
 * SEMPRE isso, nunca soft-delete da linha (histórico de source/trialEndsAt
 * fica).
 */

import { z } from 'zod';
import { MODULE_KEYS, PLANS } from './modules';

export const entitlementStatusSchema = z.enum(['active', 'trial', 'revoked']);
export type EntitlementStatusInput = z.infer<typeof entitlementStatusSchema>;

/** Mirror de `EntitlementSource` (packages/db/prisma/schema.prisma) — contracts não depende do Prisma. */
export const entitlementSourceSchema = z.enum(['plan', 'addon', 'manual', 'trial']);
export type EntitlementSourceValue = z.infer<typeof entitlementSourceSchema>;

export const setEntitlementSchema = z
  .object({
    status: entitlementStatusSchema,
    trialEndsAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((input) => (input.status === 'trial') === (input.trialEndsAt !== undefined), {
    message: 'trialEndsAt é obrigatório se, e só se, status="trial".',
    path: ['trialEndsAt'],
  });
export type SetEntitlementInput = z.infer<typeof setEntitlementSchema>;

/** Um módulo NÃO-core no painel — estado das 3 camadas (§5-B.1) + metadados do registry. */
export const moduleStateSchema = z.strictObject({
  moduleKey: z.enum(MODULE_KEYS as [string, ...string[]]),
  entitled: z.boolean(),
  enabled: z.boolean(),
  released: z.boolean(),
  active: z.boolean(),
  /** null = tenant nunca teve entitlement pra este módulo (nenhuma linha em tenant_entitlements). */
  source: entitlementSourceSchema.nullable(),
  status: entitlementStatusSchema.nullable(),
  trialEndsAt: z.iso.datetime().nullable(),
  plans: z.array(z.enum(PLANS)),
  requires: z.array(z.string()),
  addon: z.boolean(),
});
export type ModuleStateResponse = z.infer<typeof moduleStateSchema>;

export const moduleStatesResponseSchema = z.strictObject({ modules: z.array(moduleStateSchema) });
export type ModuleStatesResponse = z.infer<typeof moduleStatesResponseSchema>;
