import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Segredo do dispositivo de impressão (NG-06). Formato `molho_pd_<corpo>`,
 * onde o corpo são 32 bytes aleatórios em base64url (~43 chars).
 *
 * O que vai pro banco: `token_prefix` (12 primeiros chars do corpo, em claro —
 * lookup do guard e exibição na UI) + `token_hash` (scrypt, `salt:hash` hex).
 * O segredo completo só existe uma vez, no retorno do pareamento.
 *
 * scrypt do `node:crypto` — sem dependência nova. Parâmetros default do Node
 * (N=16384, r=8, p=1): caro o suficiente pra um segredo de 256 bits que já é
 * aleatório (não é senha de humano), barato o suficiente pra validar a cada
 * claim do agente (~3s de intervalo).
 */

const PREFIX = 'molho_pd_';
const SECRET_BYTES = 32;
const TOKEN_PREFIX_LEN = 12;
const SALT_BYTES = 16;
const KEY_LEN = 32;

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
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(secret, salt, KEY_LEN);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyDeviceSecret(secret: string, stored: string): boolean {
  const sep = stored.indexOf(':');
  if (sep === -1) return false;
  const salt = Buffer.from(stored.slice(0, sep), 'hex');
  const expected = Buffer.from(stored.slice(sep + 1), 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = scryptSync(secret, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
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
