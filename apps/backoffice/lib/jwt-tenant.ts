/** `sub` do JWT (userId do staff) — pra marcar autoria dos intents da fila offline. Mesma decodificação-sem-verificar (o servidor revalida). */
export function subFromToken(accessToken: string): string | null {
  const sub = decodePayload(accessToken)?.sub;
  return typeof sub === 'string' ? sub : null;
}

interface JwtPayload {
  sub?: string;
  roles?: string[];
}

/**
 * `platform.superadmin` não tem tenant nenhum (`scopeType: 'platform'`) —
 * é o único jeito da UI de login saber "isso não é falta de vínculo, é
 * staff de plataforma" antes de decidir pra onde mandar depois do OTP.
 * Mesma decodificação-sem-verificar de `subFromToken`: o servidor sempre
 * revalida em cada rota `@RequirePlatformContext`.
 */
export function isPlatformSuperadmin(accessToken: string): boolean {
  return decodePayload(accessToken)?.roles?.includes('platform.superadmin') ?? false;
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
