/**
 * Contrato de provisionamento de tenant pelo super-admin (Épico 14.6) —
 * distinto do self-signup (`signup.ts`): aqui é o painel interno da
 * plataforma que cria um domínio direto (ex.: cliente fechado por venda
 * assistida, sem passar pelo wizard público). Owner nasce com papel
 * `owner`/tenant via o MESMO `StaffProvisioningRepository.findOrCreateUser`
 * do provisionamento de staff — login por OTP depois é o caminho normal
 * (Épico 9c), nunca senha.
 *
 * `immediate` decide a origem do entitlement dos módulos default do plano:
 * `false` (padrão) replica o comportamento do self-signup — trial de 7 dias,
 * `source: 'trial'`; `true` já nasce `source: 'manual', status: 'active'`
 * (cliente fechado, sem trial). Mistura módulos com o resto do 15/16 seria
 * um risco separado — aqui só se toca no que já existe de provisioning.
 */

import { z } from 'zod';
import { PLANS } from './modules';

export const provisionTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  plan: z.enum(PLANS),
  ownerEmail: z.string().trim().min(3).max(254),
  ownerName: z.string().trim().min(2).max(120),
  immediate: z.boolean().default(false),
});
export type ProvisionTenantInput = z.infer<typeof provisionTenantSchema>;

export const provisionTenantResponseSchema = z.strictObject({
  tenant: z.strictObject({ id: z.uuid(), slug: z.string(), name: z.string() }),
  store: z.strictObject({ id: z.uuid(), name: z.string() }),
  ownerUserId: z.uuid(),
  ownerCreated: z.boolean(),
});
export type ProvisionTenantResponse = z.infer<typeof provisionTenantResponseSchema>;
