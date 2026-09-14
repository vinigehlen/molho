import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hash genérico scrypt(segredo) — `salt:hash` hex. Extraído de
 * printing/print-device-secret.ts (Épico 10) pro PIN de staff (Épico 20)
 * reusar em vez de duplicar; a mesma primitiva serve os dois porque nenhum
 * dos dois é senha de humano digitada em massa (device secret é aleatório;
 * PIN é curto mas o custo de scrypt já cobre um atacante com acesso de
 * leitura ao banco — rate limit na aplicação cobre brute-force online).
 */

const SALT_BYTES = 16;
const KEY_LEN = 32;

export function hashSecret(secret: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(secret, salt, KEY_LEN);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const sep = stored.indexOf(':');
  if (sep === -1) return false;
  const salt = Buffer.from(stored.slice(0, sep), 'hex');
  const expected = Buffer.from(stored.slice(sep + 1), 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = scryptSync(secret, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
