/**
 * Extrai o tenantId do primeiro scope de tenant de um JWT de staff. Decode SEM
 * verificar assinatura de propósito: serve só pra ESCOLHER o tenant no cliente
 * — o servidor revalida tudo (assinatura, token_version, can()) a cada request.
 * Util compartilhado (não dev-only): o login real do Épico 9b decide o tenant
 * pela mesma leitura.
 */
export function firstTenantScopeId(accessToken: string): string | null {
  const part = accessToken.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { scopes?: { scopeType?: string; scopeId?: string | null }[] };
    const tenantScope = payload.scopes?.find((s) => s.scopeType === 'tenant' && typeof s.scopeId === 'string');
    return tenantScope?.scopeId ?? null;
  } catch {
    return null;
  }
}
