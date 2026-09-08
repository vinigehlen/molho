import type {
  ImpersonationSessionResponse,
  MarkSubscriptionPaidInput,
  ModuleKey,
  ModuleStateResponse,
  ProvisionStaffInput,
  ProvisionStaffResponse,
  ProvisionTenantInput,
  ProvisionTenantResponse,
  PlatformTenant,
  StartImpersonationInput,
  SubscriptionResponse,
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

export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResponse> {
  const res = await apiFetch('/v1/admin/platform/tenants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao provisionar tenant (${res.status})`);
  return (await res.json()) as ProvisionTenantResponse;
}

/** "O recurso mais perigoso da plataforma" (docs/01 §5-C.1) — motivo escrito obrigatório, expira em 30min, somente-leitura por padrão. */
export async function startImpersonation(
  tenantId: string,
  input: StartImpersonationInput,
): Promise<ImpersonationSessionResponse> {
  const res = await apiFetch(`/v1/admin/platform/tenants/${encodeURIComponent(tenantId)}/impersonate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao iniciar impersonation (${res.status})`);
  return (await res.json()) as ImpersonationSessionResponse;
}

/** Épico 13d — assinatura de QUALQUER tenant, vista pelo super-admin. */
export async function fetchTenantSubscription(tenantId: string): Promise<SubscriptionResponse> {
  const res = await apiFetch(`/v1/admin/platform/tenants/${encodeURIComponent(tenantId)}/subscription`);
  if (!res.ok) throw new Error(`Falha ao carregar assinatura (${res.status})`);
  return (await res.json()) as SubscriptionResponse;
}

/**
 * Super-admin confirma "recebi o PIX/boleto" na mão — cobrança MANUAL no
 * piloto (CLAUDE.md, sem PSP recorrente ainda). `periodDays` tem default 30
 * no schema (`markSubscriptionPaidSchema`), mas `z.infer` reflete o tipo de
 * SAÍDA (pós-default, obrigatório) — o default aqui replica o mesmo valor
 * pro chamador não precisar saber disso.
 */
export async function markTenantSubscriptionPaid(
  tenantId: string,
  input: MarkSubscriptionPaidInput = { periodDays: 30 },
): Promise<SubscriptionResponse> {
  const res = await apiFetch(`/v1/admin/platform/tenants/${encodeURIComponent(tenantId)}/subscription/mark-paid`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao marcar assinatura como paga (${res.status})`);
  return (await res.json()) as SubscriptionResponse;
}
