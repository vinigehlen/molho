/**
 * Sessão de staff do backoffice: access token curto + tenant ativo. O token
 * fica SOMENTE em memória; reload recupera um novo access pelo refresh cookie
 * httpOnly da API. sessionStorage guarda apenas a preferência de tenant, nunca
 * credencial.
 */
export interface StaffSession {
  accessToken: string;
  /** UUID do tenant ativo — vira o header X-Tenant-Id. Staff multi-tenant escolhe qual. */
  tenantId: string;
  /** userId (sub do JWT) — marca autoria dos intents da fila offline (tablet compartilhado). */
  userId: string;
  tenantName: string;
}

const TENANT_KEY = 'molho.staff-tenant';
const LOGOUT_EVENT_KEY = 'molho.staff-logout';
const clearListeners = new Set<() => void>();
let currentSession: StaffSession | null = null;

function clearLocalState(): void {
  currentSession = null;
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(TENANT_KEY);
}

export function getStaffSession(): StaffSession | null {
  return currentSession;
}

export function setStaffSession(session: StaffSession): void {
  currentSession = session;
  if (typeof window !== 'undefined') window.sessionStorage.setItem(TENANT_KEY, session.tenantId);
}

export function clearStaffSession(): void {
  clearLocalState();
  for (const listener of clearListeners) listener();
  if (typeof window !== 'undefined') {
    // Não é credencial: só um sino efêmero pra outras abas limparem a sessão
    // que existe na memória de cada realm. `storage` não dispara na aba que
    // escreveu, por isso os listeners locais são chamados acima.
    window.localStorage.setItem(LOGOUT_EVENT_KEY, `${Date.now()}:${Math.random()}`);
  }
}

export function getPreferredTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TENANT_KEY);
}

/** Propaga logout/expiração às outras abas sem persistir token no browser. */
export function subscribeStaffSessionClear(listener: () => void): () => void {
  clearListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== LOGOUT_EVENT_KEY || event.newValue === null) return;
    clearLocalState();
    listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    clearListeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
