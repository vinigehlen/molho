import type {
  ModuleKey,
  ModuleStateResponse,
  ProvisionStaffInput,
  ProvisionStaffResponse,
  PlatformTenant,
} from '@molho/contracts';
import { apiFetch } from './api-client';

export type { PlatformTenant };

export async function fetchPlatformTenants(): Promise<PlatformTenant[]> {
  const res = await apiFetch('/v1/admin/platform/tenants');
  if (!res.ok) throw new Error(`Falha ao carregar tenants (${res.status})`);
  const body = (await res.json()) as { tenants: PlatformTenant[] };
  return body.tenants;
}

export async function fetchTenantModules(tenantId: string): Promise<ModuleStateResponse[]> {
  const res = await apiFetch(`/v1/admin/platform/tenants/${encodeURIComponent(tenantId)}/modules`);
  if (!res.ok) throw new Error(`Falha ao carregar módulos (${res.status})`);
  const body = (await res.json()) as { modules: ModuleStateResponse[] };
  return body.modules;
}

export async function setTenantEntitlement(
  tenantId: string,
  moduleKey: ModuleKey,
  status: 'active' | 'revoked',
): Promise<ModuleStateResponse> {
  const res = await apiFetch(`/v1/admin/platform/tenants/${encodeURIComponent(tenantId)}/entitlements/${moduleKey}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar módulo (${res.status})`);
  return (await res.json()) as ModuleStateResponse;
}

export async function provisionStaff(input: ProvisionStaffInput): Promise<ProvisionStaffResponse> {
  const res = await apiFetch('/v1/admin/platform/staff', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao provisionar staff (${res.status})`);
  return (await res.json()) as ProvisionStaffResponse;
}
