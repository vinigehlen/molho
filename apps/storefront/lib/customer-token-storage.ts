import { z } from 'zod';

/**
 * Persistência do accessToken do cliente (ganho no OTP do checkout) —
 * decisão explícita: SÓ o accessToken, sem refreshToken. O access token
 * dura 15min (mesmo TTL do backend, `token-payload.ts`); sem endpoint de
 * refresh pro cliente ainda (só existe pra staff, e mesmo esse só a nível
 * de serviço, sem rota HTTP), persistir o refresh não estenderia a sessão
 * de verdade — só guardaria uma credencial sem jeito de usar. Cobre o caso
 * real que importa pro MVP: reload de página / trocar de aba durante o
 * checkout em si. Depois de 15min, ou trocando de aparelho, o cliente loga
 * de novo por OTP — mesma UX de não ter persistido nada, só que com essa
 * janela curta a mais.
 */
export const CUSTOMER_TOKEN_SCHEMA_VERSION = 1;
export const CUSTOMER_TOKEN_TTL_MS = 15 * 60 * 1000;

export const storedCustomerTokenSchema = z.object({
  schemaVersion: z.literal(CUSTOMER_TOKEN_SCHEMA_VERSION),
  accessToken: z.string(),
  customerId: z.string(),
  issuedAt: z.iso.datetime(),
});

export type StoredCustomerToken = z.infer<typeof storedCustomerTokenSchema>;

export function customerTokenStorageKey(slug: string): string {
  return `molho:customer-token:${slug}`;
}

/**
 * Fail-safe: qualquer coisa fora do esperado (corrompido, formato antigo,
 * expirado) devolve `null` — nunca lança. Token show é conveniência, não
 * fonte de verdade; se houver dúvida, pedir OTP de novo é sempre seguro.
 */
export function parseStoredCustomerToken(raw: string | null, now: Date = new Date()): StoredCustomerToken | null {
  if (!raw) return null;

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = storedCustomerTokenSchema.safeParse(candidate);
  if (!parsed.success) return null;

  const age = now.getTime() - new Date(parsed.data.issuedAt).getTime();
  if (age > CUSTOMER_TOKEN_TTL_MS) return null;

  return parsed.data;
}
