import { createHmac } from 'node:crypto';
import { decryptPhone, encryptPhone, type EncryptedPhone } from './phone';

/**
 * E-mail em repouso (LGPD, regra 11) — mesma política do telefone, que já é
 * cifrado na MESMA tabela: deixar o e-mail em claro ao lado criaria duas
 * políticas de PII lado a lado, e a mais fraca vira o teto real. Um dump
 * vazado não pode entregar a lista de e-mails de LOJISTAS — são exatamente as
 * contas com poder de `owner`, alvo pronto de phishing.
 *
 * A cifra em si (AES-256-GCM, iv+authTag+ciphertext) não tem nada de
 * específico de telefone — por isso é REUSADA, não reimplementada.
 */
export type EncryptedEmail = EncryptedPhone;
export const encryptEmail = encryptPhone;
export const decryptEmail = decryptPhone;

/**
 * `users.email_lookup_hash`: HMAC-SHA256 determinístico com PEPPER DEDICADA —
 * é o que o login de staff por OTP busca. Nunca SHA256 puro: o espaço de
 * e-mails é enumerável, um hash sem pepper cai por dicionário.
 *
 * Pepper SEPARADA de MOLHO_ENCRYPTION_KEYS de propósito (e não versionada):
 * a chave de cifra rotaciona barato — `*_key_version` permite rotação lazy,
 * linha a linha. O pepper NÃO: o hash É o índice de busca, então trocá-lo
 * exige re-hashear a tabela inteira num job offline. Amarrar os dois faria
 * toda rotação de cifra virar migração em massa. Isto é chave de VIDA LONGA.
 *
 * Fora do banco, sempre: env var (`fly secrets set` em deploy, .env.local em
 * dev). Ausente = LANÇA, nunca degrada pra hash sem pepper.
 */
function pepper(): Buffer {
  const raw = process.env.MOLHO_EMAIL_PEPPER;
  if (!raw) throw new Error('MOLHO_EMAIL_PEPPER não configurada — ver .env.example');
  return Buffer.from(raw, 'base64');
}

/**
 * `email` DEVE vir já normalizado por `parseEmail` (trim + lowercase) — é o
 * que faz "Ana@x.com" e "ana@x.com" caírem no MESMO registro em vez de criar
 * duas contas pra mesma pessoa.
 */
export function hashEmailForLookup(email: string): string {
  return createHmac('sha256', pepper()).update(email).digest('hex');
}
