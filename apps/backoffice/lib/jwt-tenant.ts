/**
 * Extrai o tenantId do primeiro scope de tenant de um JWT de staff. Decode SEM
 * verificar assinatura de propósito: serve só pra ESCOLHER o tenant no cliente
 * — o servidor revalida tudo (assinatura, token_version, can()) a cada request.
 * Util compartilhado (não dev-only): o login real do Épico 9b decide o tenant
 * pela mesma leitura.
 */
export function firstTenantScopeId(accessToken: string): string | null {
  return decodePayload(accessToken)?.scopes?.find((s) => s.scopeType === 'tenant' && typeof s.scopeId === 'string')?.scopeId ?? null;
}

/** `sub` do JWT (userId do staff) — pra marcar autoria dos intents da fila offline. Mesma decodificação-sem-verificar (o servidor revalida). */
export function subFromToken(accessToken: string): string | null {
  const sub = decodePayload(accessToken)?.sub;
  return typeof sub === 'string' ? sub : null;
}

interface JwtPayload {
  sub?: string;
  scopes?: { scopeType?: string; scopeId?: string | null }[];
}

function decodePayload(accessToken: string): JwtPayload | null {
  const part = accessToken.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as JwtPayload;
  } catch {
    return null;
  }
}
