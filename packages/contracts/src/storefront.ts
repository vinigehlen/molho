/**
 * Contrato da API pública do storefront — `GET /v1/store/:slug`.
 *
 * É a ÚNICA rota do Molho sem autenticação: o slug na URL é o tenant, não há
 * JWT nem header `X-Tenant-Id`. Por isso o contrato é explícito e mora aqui,
 * consumido dos dois lados (a API monta, o storefront lê).
 *
 * Payload ANINHADO de propósito (decisão do Épico 5): loja + categorias +
 * produtos + grupos + modificadores numa resposta só. O alvo é LCP < 2,5s em
 * 4G num Android mediano (definicoes-v1 §8) — uma cascata de requests para
 * montar um cardápio custa mais round-trip do que o payload economiza em
 * bytes. Cacheável na borda por 30s (`s-maxage=30`), o que faz o custo por
 * visita tender a zero num rush.
 *
 * O que este payload NÃO expõe, de propósito: `tenant_id` (o cliente final
 * não tem nada a fazer com ele), `version` (optimistic locking é do caminho
 * de escrita), produtos/categorias invisíveis ou soft-deletados, e qualquer
 * dado de outro tenant — a rota roda sob RLS como todas as outras.
 */

import { z } from 'zod';

/** Dinheiro é SEMPRE inteiro em centavos (CLAUDE.md regra 4). Nunca float, nunca string. */
const centsSchema = z.int().nonnegative();

export const storefrontModifierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Complemento nunca reduz o preço base — CHECK >= 0 no banco. */
  priceDeltaCents: centsSchema,
});

export const storefrontModifierGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** `min > 0` = grupo obrigatório. `max` limita a seleção ("Escolha até 2"). */
  min: z.int().nonnegative(),
  max: z.int().nonnegative(),
  modifiers: z.array(storefrontModifierSchema),
});

export const storefrontProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  basePriceCents: centsSchema,
  /**
   * URL pública já resolvida pela API a partir de `Product.imageKey` — o front
   * nunca monta URL de bucket. Assim, trocar R2 público por domínio próprio
   * (`cdn.molho.store`, Fase 2) é mudança de env var no servidor, sem deploy
   * de front. `null` = produto sem foto (ou leitura pública ainda não
   * configurada), e o card cai no placeholder do tema.
   */
  imageUrl: z.url().nullable(),
  /** "Esgotado manual" (definicoes-v1 §5.4): item aparece no cardápio, mas não entra no carrinho. */
  available: z.boolean(),
  modifierGroups: z.array(storefrontModifierGroupSchema),
});

export const storefrontCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  products: z.array(storefrontProductSchema),
});

export const storefrontStoreSchema = z.object({
  slug: z.string(),
  /** Nome da marca (`tenants.name`) — é o que vai no cabeçalho do storefront. */
  name: z.string(),
  /**
   * Chave do template de tema. Propositalmente `string`, não enum: `getTheme()`
   * em `@molho/ui` já resolve chave desconhecida caindo no tema padrão, e um
   * enum estrito aqui transformaria "tema estranho no banco" em "storefront
   * quebrado". Validação estrita é do caminho de escrita (wizard, Épico 13b).
   */
  themeKey: z.string(),
  timezone: z.string(),
  addressText: z.string().nullable(),
  phone: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  /** Pedido mínimo. Exibido no cardápio; só vira bloqueio no checkout (Épico 7). */
  minOrderCents: centsSchema,
});

export const storefrontPayloadSchema = z.object({
  store: storefrontStoreSchema,
  categories: z.array(storefrontCategorySchema),
});

export type StorefrontModifier = z.infer<typeof storefrontModifierSchema>;
export type StorefrontModifierGroup = z.infer<typeof storefrontModifierGroupSchema>;
export type StorefrontProduct = z.infer<typeof storefrontProductSchema>;
export type StorefrontCategory = z.infer<typeof storefrontCategorySchema>;
export type StorefrontStore = z.infer<typeof storefrontStoreSchema>;
export type StorefrontPayload = z.infer<typeof storefrontPayloadSchema>;
