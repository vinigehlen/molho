import { apiFetch } from './api-client';
import { getStaffSession } from './staff-session';

export interface StaffStore {
  id: string;
  name: string;
}

interface TenantWithStores {
  id: string;
  stores: StaffStore[];
}

/**
 * Lojas do tenant ATIVO da sessão (Épico 6 hardening) — mesma fonte de
 * verdade do seletor de tenant no login (GET /v1/me/sessions/tenants,
 * Épico 9b), filtrada pelo tenantId corrente (o mesmo que já vai no header
 * X-Tenant-Id de toda chamada autenticada, ver api-client.ts). É o que mata
 * o storeId digitado à mão: a UI só pode escolher uma loja que o próprio
 * JWT prova que o staff tem acesso.
 */
export async function fetchMyStores(): Promise<StaffStore[]> {
  const res = await apiFetch('/v1/me/sessions/tenants');
  if (!res.ok) throw new Error(`Falha ao carregar lojas (${res.status})`);
  const body = (await res.json()) as { tenants: TenantWithStores[] };
  const tenantId = getStaffSession()?.tenantId;
  return body.tenants.find((tenant) => tenant.id === tenantId)?.stores ?? [];
}
