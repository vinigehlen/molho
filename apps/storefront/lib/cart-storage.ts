import { z } from 'zod';
import type { Cart, CartItem } from '@molho/contracts';

/**
 * Reimplementação local do schema e das funções de
 * `packages/contracts/src/cart.ts`.
 *
 * NUNCA importar `@molho/contracts` em runtime de arquivo `'use client'` —
 * o webpack do `next dev` injeta boilerplate de Fast Refresh no CommonJS
 * compilado do pacote (é `workspace:*`, resolvido por symlink direto pra
 * pasta real) e quebra com "Cannot use 'import.meta' outside a module" (ver
 * comentário longo em `app/home-placeholder.tsx`). `import type` sobrevive
 * — é apagado pelo TypeScript antes do webpack ver o arquivo — por isso os
 * TIPOS (`Cart`, `CartItem`) continuam vindo do pacote canônico; só o
 * SCHEMA e a lógica de runtime são copiados.
 *
 * `zod` aqui é o pacote npm de verdade (dependência direta deste app, não
 * `workspace:*`) — sem symlink, sem o problema.
 *
 * Se `cart.ts` mudar de forma um dia, replicar aqui também. Os testes deste
 * arquivo espelham de propósito os de `cart.test.ts` — mesmo comportamento,
 * duas fontes. `cart-schema-parity.test.ts` é a rede de segurança contra
 * esquecer: compara `CART_SCHEMA_VERSION` e os campos de `cartItemSchema`
 * dos dois arquivos e reprova se divergirem.
 */
export const CART_SCHEMA_VERSION = 2;
export const CART_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const centsSchema = z.int().nonnegative();

const cartModifierSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  name: z.string(),
  priceDeltaCents: centsSchema,
});

export const cartItemSchema = z.object({
  lineId: z.uuid(),
  productId: z.uuid(),
  offerId: z.uuid().optional(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.url().nullable(),
  unitBasePriceCents: centsSchema,
  removedChildIds: z.array(z.uuid()).optional(),
  modifiers: z.array(cartModifierSchema),
  quantity: z.int().positive(),
  notes: z.string().max(280).nullable(),
});

const cartSchema = z.object({
  schemaVersion: z.literal(CART_SCHEMA_VERSION),
  slug: z.string(),
  items: z.array(cartItemSchema),
  updatedAt: z.iso.datetime(),
});

export function cartStorageKey(slug: string): string {
  return `molho:cart:${slug}`;
}

export function emptyCart(slug: string): Cart {
  return { schemaVersion: CART_SCHEMA_VERSION, slug, items: [], updatedAt: new Date().toISOString() };
}

/**
 * Leitura defensiva: nunca lança. Carrinho corrompido, de outra loja, em
 * formato antigo, com item adulterado (preço negativo, quantidade zero) ou
 * velho demais — tudo vira carrinho vazio, nunca erro. Ver o aviso em
 * `cart.ts`: o carrinho é conveniência de exibição, o servidor revalida
 * tudo no checkout.
 */
export function parseStoredCart(raw: string | null, slug: string, now: Date = new Date()): Cart {
  if (!raw) return emptyCart(slug);

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return emptyCart(slug);
  }

  const parsed = cartSchema.safeParse(candidate);
  if (!parsed.success) return emptyCart(slug);
  if (parsed.data.slug !== slug) return emptyCart(slug);

  const age = now.getTime() - new Date(parsed.data.updatedAt).getTime();
  if (age > CART_MAX_AGE_MS) return emptyCart(slug);

  return parsed.data;
}

export function lineTotalCents(item: CartItem): number {
  const unit = item.modifiers.reduce((sum, modifier) => sum + modifier.priceDeltaCents, item.unitBasePriceCents);
  return unit * item.quantity;
}

export function cartSubtotalCents(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + lineTotalCents(item), 0);
}

/** Total de UNIDADES (o contador do MoCartBar), não de linhas. */
export function cartItemCount(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}
