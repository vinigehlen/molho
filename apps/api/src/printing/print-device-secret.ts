import { randomBytes } from 'node:crypto';
import { hashSecret, verifySecret } from '../security/scrypt-secret';

/**
 * Segredo do dispositivo de impressão (NG-06). Formato `molho_pd_<corpo>`,
 * onde o corpo são 32 bytes aleatórios em base64url (~43 chars).
 *
 * O que vai pro banco: `token_prefix` (12 primeiros chars do corpo, em claro —
 * lookup do guard e exibição na UI) + `token_hash` (scrypt, `salt:hash` hex,
 * ver security/scrypt-secret.ts). O segredo completo só existe uma vez, no
 * retorno do pareamento.
 */

const PREFIX = 'molho_pd_';
const SECRET_BYTES = 32;
const TOKEN_PREFIX_LEN = 12;

export interface GeneratedDeviceSecret {
  /** `molho_pd_...` — mostrado UMA vez, nunca persistido. */
  secret: string;
  tokenPrefix: string;
  tokenHash: string;
}

export function generateDeviceSecret(): GeneratedDeviceSecret {
  const body = randomBytes(SECRET_BYTES).toString('base64url');
  const secret = PREFIX + body;
  return { secret, tokenPrefix: body.slice(0, TOKEN_PREFIX_LEN), tokenHash: hashDeviceSecret(secret) };
}

export function hashDeviceSecret(secret: string): string {
  return hashSecret(secret);
}

export function verifyDeviceSecret(secret: string, stored: string): boolean {
  return verifySecret(secret, stored);
}

/** Extrai o prefixo pro lookup. `null` = não tem a cara de um segredo de device. */
export function parseDeviceSecret(raw: string): { tokenPrefix: string } | null {
  if (!raw.startsWith(PREFIX)) return null;
  const body = raw.slice(PREFIX.length);
  if (body.length < TOKEN_PREFIX_LEN + 8) return null;
  return { tokenPrefix: body.slice(0, TOKEN_PREFIX_LEN) };
}

/** `molho_pd_a1b2c3d4e5f6••••` — pra UI/log, nunca o segredo inteiro. */
export function maskDeviceSecret(tokenPrefix: string): string {
  return `${PREFIX}${tokenPrefix}••••`;
}
