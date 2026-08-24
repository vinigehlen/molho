import { API_URL } from './api-config';
import { subFromToken } from './jwt-tenant';
import {
  clearStaffSession,
  getPreferredTenantId,
  getStaffSession,
  setStaffSession,
  type StaffSession,
} from './staff-session';

const BACKOFFICE_HEADERS = { 'x-molho-client': 'backoffice' } as const;

export interface StaffTenant {
  id: string;
  name: string;
  slug: string;
  stores: { id: string; name: string }[];
}

interface LoginResult {
  accessToken: string;
  user: { id: string; name: string };
  tenants: StaffTenant[];
}

async function fetchForLogin(url: string, init: RequestInit | undefined, networkMessage: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(networkMessage);
  }
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? fallback;
}

export async function fetchOtpChannel(): Promise<'email' | 'sms'> {
  const res = await fetchForLogin(
    `${API_URL}/v1/auth/otp/config`,
    undefined,
    'Não foi possível carregar o login. Confira sua conexão.',
  );
  if (!res.ok) throw new Error('Não foi possível carregar o login.');
  const body = (await res.json().catch(() => null)) as { channel?: unknown } | null;
  if (body?.channel !== 'email' && body?.channel !== 'sms') {
    throw new Error('A configuração do login veio inválida.');
  }
  return body.channel;
}

export async function requestStaffOtp(channel: 'email' | 'sms', identifier: string): Promise<void> {
  const res = await fetchForLogin(
    `${API_URL}/v1/auth/otp/request`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(channel === 'email' ? { email: identifier } : { phone: identifier }),
    },
    'Não foi possível enviar o código. Confira sua conexão.',
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Não foi possível enviar o código.'));
}

async function fetchTenants(accessToken: string): Promise<StaffTenant[]> {
  const res = await fetchForLogin(
    `${API_URL}/v1/me/sessions/tenants`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    'Não foi possível carregar seus restaurantes. Confira sua conexão.',
  );
  if (!res.ok) throw new Error('Não foi possível carregar seus restaurantes.');
  const body = (await res.json()) as { tenants: StaffTenant[] };
  return body.tenants;
}

export async function verifyStaffOtp(
  channel: 'email' | 'sms',
  identifier: string,
  code: string,
): Promise<LoginResult> {
  const res = await fetchForLogin(
    `${API_URL}/v1/auth/otp/verify`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(channel === 'email' ? { email: identifier, code } : { phone: identifier, code }),
    },
    'Não foi possível conferir o código. Confira sua conexão.',
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Código inválido ou expirado.'));
  const body = (await res.json()) as Omit<LoginResult, 'tenants'>;
  return { ...body, tenants: await fetchTenants(body.accessToken) };
}

export function activateStaffSession(accessToken: string, tenant: StaffTenant): StaffSession {
  const userId = subFromToken(accessToken);
  if (!userId) throw new Error('Sessão inválida. Entre novamente.');
  const session = { accessToken, tenantId: tenant.id, tenantName: tenant.name, tenantSlug: tenant.slug, userId };
  setStaffSession(session);
  return session;
}

let refreshInFlight: Promise<StaffSession | null> | null = null;

export function refreshStaffSession(): Promise<StaffSession | null> {
  if (refreshInFlight) return refreshInFlight;
  const rotate = async () => {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: BACKOFFICE_HEADERS,
      credentials: 'include',
    });
    if (!res.ok) {
      clearStaffSession();
      return null;
    }
    const { accessToken } = (await res.json()) as { accessToken: string };
    const tenants = await fetchTenants(accessToken);
    const preferredId = getStaffSession()?.tenantId ?? getPreferredTenantId();
    const tenant = tenants.find((item) => item.id === preferredId) ?? tenants[0];
    if (!tenant) {
      clearStaffSession();
      return null;
    }
    return activateStaffSession(accessToken, tenant);
  };

  // O cookie é compartilhado entre abas e rotaciona a cada uso. Web Locks
  // impede duas abas de apresentarem o mesmo refresh ao mesmo tempo (o
  // servidor trataria a segunda como reuso e revogaria todas as sessões).
  const rotation =
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks
          .request<Promise<StaffSession | null>>('molho.staff-refresh', () => rotate())
          .then((session) => session)
      : rotate();
  const tracked = rotation.finally(() => {
    refreshInFlight = null;
  });
  refreshInFlight = tracked;
  return tracked;
}

export async function logoutStaffSession(): Promise<boolean> {
  const session = getStaffSession();
  if (!session) {
    clearStaffSession();
    return true;
  }
  const res = await fetch(`${API_URL}/v1/auth/logout`, {
    method: 'POST',
    headers: { ...BACKOFFICE_HEADERS, Authorization: `Bearer ${session.accessToken}` },
    credentials: 'include',
  }).catch(() => null);
  if (!res?.ok) return false;
  clearStaffSession();
  return true;
}
