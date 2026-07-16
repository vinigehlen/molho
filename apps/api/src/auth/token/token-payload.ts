import type { ScopeType } from '@molho/contracts';

/** Espelha RoleAssignment de packages/contracts/permissions.ts — é o que
 * sustenta can() sem round-trip no login (reconstrói o Actor a partir do
 * JWT). `roles` é só a lista de nomes (exibição rápida); `scopes` é o
 * necessário pra checagem de verdade. */
export interface TokenScope {
  role: string;
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface TokenPayload {
  sub: string;
  roles: string[];
  scopes: TokenScope[];
  tokenVersion: number;
  deviceId: string;
  jti: string;
}

export interface DeviceInfo {
  userAgent?: string;
  ip: string;
}

/**
 * Mapa versão→chave (mesmo padrão de MOLHO_ENCRYPTION_KEYS/MOLHO_OTP_HMAC_KEY,
 * mas separada das duas — rotação independente). Assina sempre com a versão
 * mais alta (embutida no header `kid` do JWT); versões antigas continuam
 * válidas pra VERIFICAR por um período de graça (o tempo de vida de um
 * access token — 15min — já cobre isso na prática, mas nada impede manter
 * mais versões por mais tempo se quiser um período de graça maior).
 */
export function loadJwtSecrets(): Record<string, string> {
  const raw = process.env.MOLHO_JWT_SECRETS;
  if (!raw) throw new Error('MOLHO_JWT_SECRETS não configurada — ver .env.example');
  return JSON.parse(raw) as Record<string, string>;
}

export function currentJwtKeyVersion(secrets: Record<string, string>): string {
  const versions = Object.keys(secrets)
    .map(Number)
    .sort((a, b) => b - a);
  const latest = versions[0];
  if (latest === undefined) throw new Error('MOLHO_JWT_SECRETS está vazia');
  return String(latest);
}
