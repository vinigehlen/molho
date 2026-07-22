/**
 * Endereço do cliente enquanto ele navega — Épico 6.
 *
 * CLAUDE.md regra 13: endereço é ANÔNIMO até o checkout. Vive inteiro no
 * `localStorage`, mesma chave-por-loja e mesmo tratamento de
 * `Cart`/`CartItem` (`cart.ts`) — schema versionado, servidor nunca confia
 * nisto. Só depois do OTP no checkout (Épico 7) é que um endereço vira linha
 * em `addresses` (Prisma), vinculada ao `customer` autenticado.
 *
 * `lat`/`lng` são NULLABLE de propósito: este épico não tem nenhuma API de
 * mapa (nem geocoding) — só existem se o cliente tocou "usar minha
 * localização" (`navigator.geolocation`, nativo do browser, sem provider
 * nenhum). Endereço só em texto (sem coordenada) é um estado válido: o
 * cliente pode preencher o formulário, mas o back não confirma cobertura de
 * entrega até ter coordenada — ver `delivery-match.ts`.
 */

import { z } from 'zod';

/** Formato atual. Subir isto invalida (descarta) todo endereço salvo no formato antigo — mesma ideia do CART_SCHEMA_VERSION. */
export const ADDRESS_SCHEMA_VERSION = 1;

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
  /** Só existe se veio de `navigator.geolocation` — ver aviso no topo do arquivo. */
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  updatedAt: z.iso.datetime(),
});

export type CustomerAddress = z.infer<typeof customerAddressSchema>;

/** Chave do `localStorage`. Namespaceada por loja — mesmo isolamento do carrinho. */
export function addressStorageKey(slug: string): string {
  return `molho:address:${slug}`;
}

/**
 * Lê um endereço vindo do `localStorage` de forma fail-safe. Devolve `null`
 * (nunca lança) quando não há nada salvo, o JSON está corrompido, é de
 * formato antigo, ou tem `lat`/`lng` fora do intervalo válido (payload
 * adulterado à mão) — mesmo tratamento defensivo de `parseStoredCart`.
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
