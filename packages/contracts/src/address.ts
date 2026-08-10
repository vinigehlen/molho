/**
 * Endereço do cliente enquanto ele navega — Épico 6.
 *
 * CLAUDE.md regra 13: endereço é ANÔNIMO até o checkout. Vive inteiro no
 * `localStorage`, mesma chave-por-loja e mesmo tratamento de
 * `Cart`/`CartItem` (`cart.ts`) — schema versionado, servidor nunca confia
 * nisto. Só depois do OTP no checkout (Épico 7) é que um endereço vira linha
 * em `addresses` (Prisma), vinculada ao `customer` autenticado.
 *
 * O cliente informa CEP + número; o SERVIDOR deriva rua, bairro, cidade e
 * ponto (`GeocodeMiddleware` + `resolveAddress`, Épico 6 Bloco 2). Por isso
 * não há `lat`/`lng` aqui: coordenada vinda do cliente é ignorada pelo
 * backend desde a inversão do contrato, e campo que ninguém lê é campo que
 * mente. Os campos de texto continuam existindo como FALLBACK (ViaCEP mudo)
 * e pra exibir o endereço sem uma ida ao servidor.
 */

import { z } from 'zod';

/**
 * Formato atual. Subir isto invalida (descarta) todo endereço salvo no
 * formato antigo — mesma ideia do CART_SCHEMA_VERSION. v2 removeu
 * `lat`/`lng`; descartar os endereços v1 é o comportamento desejado, porque
 * eles são anteriores ao CEP+número obrigatórios e travariam o cliente no
 * aviso "falta o CEP" em vez de num formulário limpo.
 */
export const ADDRESS_SCHEMA_VERSION = 2;

export const customerAddressSchema = z.object({
  schemaVersion: z.literal(ADDRESS_SCHEMA_VERSION),
  /** Rótulo livre — "Casa"/"Trabalho" são sugestão de UI, nunca enum (mesmo racional do Store.themeKey). */
  label: z.string(),
  street: z.string(),
  /** "s/n" é um valor válido, não ausência de dado. */
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string().nullable(),
  /** "Perto da padaria" — padrão BR, útil pro motoboy. */
  referencePoint: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export type CustomerAddress = z.infer<typeof customerAddressSchema>;

/** Chave do `localStorage`. Namespaceada por loja — mesmo isolamento do carrinho. */
export function addressStorageKey(slug: string): string {
  return `molho:address:${slug}`;
}

/**
 * Lê um endereço vindo do `localStorage` de forma fail-safe. Devolve `null`
 * (nunca lança) quando não há nada salvo, o JSON está corrompido ou é de
 * formato antigo — mesmo tratamento defensivo de `parseStoredCart`.
 */
export function parseStoredAddress(raw: string | null): CustomerAddress | null {
  if (!raw) return null;

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = customerAddressSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
