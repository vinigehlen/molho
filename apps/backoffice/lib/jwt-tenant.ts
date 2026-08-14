/** `sub` do JWT (userId do staff) — pra marcar autoria dos intents da fila offline. Mesma decodificação-sem-verificar (o servidor revalida). */
export function subFromToken(accessToken: string): string | null {
  const sub = decodePayload(accessToken)?.sub;
  return typeof sub === 'string' ? sub : null;
}

interface JwtPayload {
  sub?: string;
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
