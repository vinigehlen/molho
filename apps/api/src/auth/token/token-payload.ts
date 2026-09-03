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

/**
 * Presente SÓ em token de impersonation (Épico 14) — `sub` continua sendo o
 * ID do ATOR REAL (super-admin), nunca um ID sintético: toda escrita feita
 * com este token grava `actorId` verdadeiro em audit_log/module_audit de
 * graça, sem precisar de nenhum código extra nesses call sites (CLAUDE.md
 * regra 9 já exige actorId real, e é exatamente o que `sub` fornece). `scopes`
 * do token carrega um papel `owner` sintético pro tenant alvo (nunca gravado
 * em `user_roles` — dura só o tempo de vida do JWT). `readOnly` é reforçado
 * por `JwtAuthGuard` (bloqueia método não-GET/HEAD/OPTIONS).
 */
export interface ImpersonationClaim {
  tenantId: string;
  readOnly: boolean;
}

export interface TokenPayload {
  sub: string;
  roles: string[];
  scopes: TokenScope[];
  tokenVersion: number;
  deviceId: string;
  jti: string;
  impersonation?: ImpersonationClaim;
  /**
   * Expiry (segundos epoch), preenchido pelo `jwt` via `expiresIn` na
   * assinatura e devolvido pelo `verifyAccessToken`. Ausente no objeto que se
   * ASSINA (signAccessToken usa Omit) — presente sempre DEPOIS de verificar.
   * O stream SSE (Épico 9) lê isto pra fechar a conexão no expiry do token.
   */
  exp: number;
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
