/**
 * Contrato do carrinho do storefront (Épico 5).
 *
 * O carrinho vive INTEIRO no cliente: `localStorage`, chave
 * `molho:cart:{slug}` — namespaceada por loja, porque o mesmo browser pode ter
 * carrinho aberto em dois restaurantes e eles nunca se misturam (mesma regra
 * de isolamento que `customers` tem no banco).
 *
 * O SERVIDOR NUNCA CONFIA NISTO. Nome e preço gravados aqui são SNAPSHOT DE
 * EXIBIÇÃO — servem pra montar a tela na hora, sem round-trip. No checkout
 * (Épico 7) o servidor revalida tudo contra o banco: preço, disponibilidade,
 * existência do produto e se os modificadores selecionados pertencem mesmo ao
 * produto e respeitam min/max. Divergência de preço é resolvida a favor do
 * banco, avisando o cliente. Tratar `localStorage` como fonte de verdade de
 * dinheiro seria entregar a calculadora de preço pro atacante.
 *
 * `schemaVersion` existe pra que uma mudança futura de formato não quebre o
 * carrinho de quem já tem um salvo: quem lê descarta o que não casa, em vez de
 * estourar. Mesma ideia do `phone_key_version` — versionar em vez de migrar.
 */

import { z } from 'zod';

/** Formato atual. Subir isto invalida (descarta) todo carrinho salvo no formato antigo. */
export const CART_SCHEMA_VERSION = 1;

/**
 * Carrinho parado por mais de 7 dias é descartado na leitura. Preço de
 * restaurante muda, e ressuscitar um carrinho de duas semanas atrás só pra
 * mostrar "o preço mudou" no checkout é pior do que começar limpo.
 */
export const CART_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const cartModifierSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  /** Snapshot de exibição — o servidor revalida no checkout. */
  name: z.string(),
  priceDeltaCents: z.int().nonnegative(),
});

export const cartItemSchema = z.object({
  /**
   * Identidade da LINHA, não do produto: o mesmo X-Burger com bacon e sem
   * bacon são duas linhas independentes. Sem isto, editar ou remover uma
   * mexeria na outra.
   */
  lineId: z.uuid(),
  productId: z.uuid(),
  /** Snapshots de exibição — ver aviso no topo do arquivo. */
  name: z.string(),
  imageUrl: z.url().nullable(),
  unitBasePriceCents: z.int().nonnegative(),
  modifiers: z.array(cartModifierSchema),
  quantity: z.int().positive(),
  /** "Sem cebola, por favor" — texto livre do cliente, vai pra comanda. */
  notes: z.string().max(280).nullable(),
});

export const cartSchema = z.object({
  schemaVersion: z.literal(CART_SCHEMA_VERSION),
  /** Slug da loja dona deste carrinho — confere com a chave, defesa contra carrinho cruzado. */
  slug: z.string(),
  items: z.array(cartItemSchema),
  /** ISO 8601. Usado pelo descarte por idade (`CART_MAX_AGE_MS`). */
  updatedAt: z.iso.datetime(),
});

export type CartModifier = z.infer<typeof cartModifierSchema>;
export type CartItem = z.infer<typeof cartItemSchema>;
export type Cart = z.infer<typeof cartSchema>;

/** Chave do `localStorage`. Namespaceada por loja — carrinho de uma nunca vaza na outra. */
export function cartStorageKey(slug: string): string {
  return `molho:cart:${slug}`;
}

export function emptyCart(slug: string): Cart {
  return { schemaVersion: CART_SCHEMA_VERSION, slug, items: [], updatedAt: new Date().toISOString() };
}

/**
 * Preço de uma linha: (base + soma dos complementos) × quantidade.
 *
 * Tudo inteiro, em centavos, e a multiplicação vem DEPOIS da soma — inverter a
 * ordem (multiplicar cada parcela e somar) daria o mesmo número aqui, mas o
 * dia que entrar desconto percentual a ordem passa a importar. Esta função é
 * a mesma que o checkout do Épico 7 usa no servidor pra conferir o total.
 */
export function lineTotalCents(item: CartItem): number {
  const unit = item.modifiers.reduce((sum, modifier) => sum + modifier.priceDeltaCents, item.unitBasePriceCents);
  return unit * item.quantity;
}

export function cartSubtotalCents(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + lineTotalCents(item), 0);
}

/** Total de UNIDADES (o "3" do badge da pill), não de linhas. */
export function cartItemCount(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Lê um carrinho vindo do `localStorage` de forma fail-safe.
 *
 * Devolve carrinho vazio (nunca lança) quando o dado está corrompido, é de
 * outro formato, é de outra loja ou está velho demais. Carrinho é conveniência
 * — se houver qualquer dúvida sobre o conteúdo, começar limpo é melhor do que
 * quebrar a loja na cara do cliente.
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
