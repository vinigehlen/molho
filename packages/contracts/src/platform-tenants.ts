/**
 * Contrato de listagem de tenants pro super-admin (Épico 14.5). Sem isso o
 * painel de módulos e o provisionamento de staff exigem que o super-admin já
 * saiba o `tenantId` de cor — este endpoint é o que permite escolher um
 * tenant na UI em vez de colar um UUID.
 */

import { z } from 'zod';

export const platformTenantSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  planId: z.string().nullable(),
  status: z.string(),
});

export type PlatformTenant = z.infer<typeof platformTenantSchema>;

export const platformTenantsResponseSchema = z.strictObject({
  tenants: z.array(platformTenantSchema),
});

export type PlatformTenantsResponse = z.infer<typeof platformTenantsResponseSchema>;
