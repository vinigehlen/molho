import { z } from 'zod';
import type { CustomerAddress } from '@molho/contracts';

/**
 * Reimplementação local do schema e das funções de
 * `packages/contracts/src/address.ts` — mesmo tratamento de `cart-storage.ts`
 * (razão completa documentada lá e em `packages/contracts/src/cart.ts`):
 * `@molho/contracts` importado em RUNTIME de arquivo `'use client'` quebra o
 * webpack do `next dev` (import.meta do CJS via symlink de workspace).
 * `import type` sobrevive — por isso o TIPO (`CustomerAddress`) continua
 * vindo do pacote canônico; só o schema e a lógica de runtime são copiados.
 *
 * Se `address.ts` mudar de forma um dia, replicar aqui também.
 * `address-schema-parity.test.ts` compara `ADDRESS_SCHEMA_VERSION` e os
 * campos de `customerAddressSchema` dos dois arquivos e reprova se
 * divergirem — mesma rede de segurança do carrinho.
 */
export const ADDRESS_SCHEMA_VERSION = 2;

export const customerAddressSchema = z.object({
  schemaVersion: z.literal(ADDRESS_SCHEMA_VERSION),
  label: z.string(),
  street: z.string(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string().nullable(),
  referencePoint: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export function addressStorageKey(slug: string): string {
  return `molho:address:${slug}`;
}

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
