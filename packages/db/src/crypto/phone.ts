import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const IV_LENGTH = 12; // padrão AES-GCM
const AUTH_TAG_LENGTH = 16;
const DEFAULT_KEY_VERSION = '1';

/**
 * `users.phone_ciphertext` (LGPD, regra 11): cifra na aplicação, nunca em
 * claro, chave nunca fica acessível ao Postgres (por isso não é pgcrypto).
 * `MOLHO_ENCRYPTION_KEYS` é um mapa versão→chave (32 bytes base64) — permite
 * ter mais de uma chave viva ao mesmo tempo pra rotação lazy (a versão usada
 * pra cifrar fica em `phone_key_version`; no login, se a versão não for a
 * mais recente, a aplicação re-cifra com a chave atual).
 */
function loadKeys(): Record<string, Buffer> {
  const raw = process.env.MOLHO_ENCRYPTION_KEYS;
  if (!raw) {
    throw new Error('MOLHO_ENCRYPTION_KEYS não configurada — ver .env.local');
  }
  const parsed = JSON.parse(raw) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(parsed).map(([version, base64]) => [version, Buffer.from(base64, 'base64')]),
  );
}

function keyFor(version: string): Buffer {
  const key = loadKeys()[version];
  if (!key) throw new Error(`sem chave de criptografia pra versão "${version}"`);
  return key;
}

export interface EncryptedPhone {
  ciphertext: Buffer;
  keyVersion: number;
}

/** iv(12) + authTag(16) + ciphertext, concatenados num Buffer só. */
export function encryptPhone(
  plaintext: string,
  keyVersion: string = DEFAULT_KEY_VERSION,
): EncryptedPhone {
  const key = keyFor(keyVersion);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, authTag, encrypted]),
    keyVersion: Number(keyVersion),
  };
}

export function decryptPhone(ciphertext: Buffer, keyVersion: number): string {
  const key = keyFor(String(keyVersion));
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** `users.phone_lookup_hash`: HMAC determinístico — é o que o login por OTP busca. */
export function hashPhoneForLookup(plaintext: string, keyVersion: string = DEFAULT_KEY_VERSION): string {
  const key = keyFor(keyVersion);
  return createHmac('sha256', key).update(plaintext).digest('hex');
}
