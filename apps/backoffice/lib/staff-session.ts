/**
 * Sessão de staff do backoffice: access token + tenant ativo. COMPARTILHADO —
 * o login real (Épico 9b) popula isto do mesmo jeito; o `dev-only-auth` é só um
 * atalho pra CHEGAR no token em dev. `sessionStorage` de propósito: some ao
 * fechar a aba (é ferramenta de balcão, não "lembrar de mim"; tablet
 * compartilhado entre turnos não deve carregar sessão de quem saiu).
 */
export interface StaffSession {
  accessToken: string;
  /** UUID do tenant ativo — vira o header X-Tenant-Id. Staff multi-tenant escolhe qual (no dev, o único do owner do seed). */
  tenantId: string;
  /** userId (sub do JWT) — marca autoria dos intents da fila offline (tablet compartilhado). */
  userId: string;
}

const KEY = 'molho.staff-session';

export function getStaffSession(): StaffSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StaffSession>;
    if (typeof parsed.accessToken === 'string' && typeof parsed.tenantId === 'string' && typeof parsed.userId === 'string') {
      return { accessToken: parsed.accessToken, tenantId: parsed.tenantId, userId: parsed.userId };
    }
  } catch {
    // storage corrompido — trata como sem sessão
  }
  return null;
}

export function setStaffSession(session: StaffSession): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearStaffSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(KEY);
}
