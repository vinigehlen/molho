/**
 * Sessão de staff do backoffice: access token curto + tenant ativo. O token
 * fica SOMENTE em memória; reload recupera um novo access pelo refresh cookie
 * httpOnly da API. sessionStorage guarda apenas a preferência de tenant, nunca
 * credencial.
 */
export interface StaffSession {
  accessToken: string;
  /** UUID do tenant ativo — vira o header X-Tenant-Id. Staff multi-tenant escolhe qual (no dev, o único do owner do seed). */
  tenantId: string;
  /** userId (sub do JWT) — marca autoria dos intents da fila offline (tablet compartilhado). */
  userId: string;
  tenantName: string;
}

const TENANT_KEY = 'molho.staff-tenant';
let currentSession: StaffSession | null = null;

export function getStaffSession(): StaffSession | null {
  return currentSession;
}

export function setStaffSession(session: StaffSession): void {
  currentSession = session;
  if (typeof window !== 'undefined') window.sessionStorage.setItem(TENANT_KEY, session.tenantId);
}

export function clearStaffSession(): void {
  currentSession = null;
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(TENANT_KEY);
}

export function getPreferredTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TENANT_KEY);
}
