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
import { paymentMethodSchema } from './checkout';

/** Dinheiro é SEMPRE inteiro em centavos (CLAUDE.md regra 4). Nunca float, nunca string. */
const centsSchema = z.int().nonnegative();

export const storefrontModifierSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  /** Complemento nunca reduz o preço base — CHECK >= 0 no banco. */
  priceDeltaCents: centsSchema,
});

export const storefrontModifierGroupSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  /** `min > 0` = grupo obrigatório. `max` limita a seleção ("Escolha até 2"). */
  min: z.int().nonnegative(),
  max: z.int().nonnegative(),
  modifiers: z.array(storefrontModifierSchema),
});

export const storefrontProductSchema = z.strictObject({
  id: z.uuid(),
  /** Apresentação escolhida nesta categoria. `id` continua sendo a identidade
   * do produto; `offerId` carrega preço/disponibilidade/ordem desta vitrine. */
  offerId: z.uuid().optional(),
  name: z.string(),
  description: z.string().nullable(),
  basePriceCents: centsSchema,
  /**
   * URL pública já resolvida pela API a partir de `Product.imageKey` — o front
   * nunca monta URL de bucket. Assim, trocar R2 público por domínio próprio
   * (Fase 2 — registrable domain SEPARADO, tipo `molhousercontent.com`, NUNCA
   * subdomínio de `molho.live`: conteúdo de usuário same-site com a API é o
   * anti-padrão que o desenho do Épico 9 barra) é mudança de env var no servidor, sem deploy
   * de front. `null` = produto sem foto (ou leitura pública ainda não
   * configurada), e o card cai no placeholder do tema.
   */
  imageUrl: z.url().nullable(),
  /**
   * Galeria completa (Épico conversão, C1), em ordem — `imageUrl` acima é
   * sempre `images[0]?.url ?? null`, nunca uma fonte independente. Card de
   * produto que só sabe de foto única continua funcionando lendo só
   * `imageUrl`; quem quiser carrossel usa este array.
   */
  images: z.array(z.strictObject({ url: z.url() })),
  /** "Esgotado manual" (definicoes-v1 §5.4): item aparece no cardápio, mas não entra no carrinho. */
  available: z.boolean(),
  modifierGroups: z.array(storefrontModifierGroupSchema),
  /**
   * Composição do combo (exceção MVP 2026-08-28, fase 4.1b) — só em produto
   * `kind = 'combo'`, e só quando o storefront pede `?catalog=offers` (mesma
   * negociação opt-in do 4C que introduz `offerId`). Exibição pura: "vem com
   * 2× Xis, 1× Refri". O preço mostrado continua vindo de
   * `basePriceCents`; em ofertas `sum_of_items`, a API já devolve ali a soma
   * atual dos filhos.
   */
  comboItems: z.array(z.strictObject({ name: z.string(), quantity: z.int().positive() })).optional(),
});

export const storefrontCategorySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  products: z.array(storefrontProductSchema),
});

export const storefrontStoreSchema = z.strictObject({
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
  /**
   * Calculado no SERVIDOR, no timezone da loja (`Store.timezone`) — nunca no
   * relógio do cliente (CLAUDE.md regra sobre store_hours, Épico 6). `false`
   * quando não há turno cobrindo o instante atual (inclusive dia sem
   * nenhuma linha em `store_hours` — "fechado" é ausência, não flag).
   */
  isOpenNow: z.boolean(),
  /**
   * Próximo instante em que a loja abre, ISO 8601 COM o offset do timezone
   * da loja embutido (ex. `2026-07-22T12:00:00-03:00`) — o cliente só
   * formata a hora pro copy `lojaFechada` (`{horario}`), nunca recalcula
   * fuso. `null` quando `isOpenNow` é `true` (não há "próxima abertura" pra
   * mostrar) ou quando a loja não tem NENHUM turno cadastrado ainda.
   */
  nextOpensAt: z.iso.datetime({ offset: true }).nullable(),
  /**
   * Épico 8 (docs/02 §5.5) — só os métodos que a loja pode ACEITAR de
   * verdade agora: módulo ligado E (pra `pix`) chave PIX configurada. O
   * storefront usa isto pra decidir o que oferecer no seletor da revisão —
   * nunca deixa o cliente escolher um método que vai estourar 409/400 no
   * fim do funil só pra descobrir que a loja não tá pronta. Array vazio é
   * um estado real: loja sem NENHUM método pronto bloqueia o checkout
   * inteiro, com aviso, antes de montar carrinho nenhum.
   */
  availablePaymentMethods: z.array(paymentMethodSchema),
});

export const storefrontPayloadSchema = z.strictObject({
  store: storefrontStoreSchema,
  categories: z.array(storefrontCategorySchema),
  /**
   * Canal do OTP de cliente (Épico 9c) — o BACKEND é fonte única. O front lê
   * daqui pra saber se pede telefone (SMS) ou telefone + e-mail, em vez de uma
   * `NEXT_PUBLIC_*` própria: duas envs podem divergir num deploy e ninguém
   * descobre até o login parar. Hoje o valor é global de deploy, mas vem por um
   * endpoint POR TENANT — quando virar config de tenant, o contrato já está no
   * lugar certo.
   */
  otpChannel: z.enum(['sms', 'email']),
  /**
   * `true` = módulo `checkout.guest` ativo neste tenant: o front pede nome +
   * telefone e finaliza SEM OTP. Dica de UI, NUNCA gate — o servidor recusa
   * igual se o cliente mentir (CLAUDE.md regra 13, EMENDA). Mesma razão do
   * `otpChannel` acima pra vir daqui e não de uma `NEXT_PUBLIC_*`: fonte
   * única, e este já é por tenant de verdade.
   */
  guestCheckout: z.boolean(),
});

/**
 * Identidade auto-declarada do checkout guest — FORA de `checkoutRequestSchema`
 * de propósito. Aquele schema serve os DOIS endpoints, e `/checkout/revalidate`
 * é público, anônimo e de alto volume: pôr telefone na base levaria PII pra uma
 * superfície que não precisa dela (CLAUDE.md regra 13, EMENDA).
 *
 * O telefone é validado de verdade (DDD, nono dígito) por `parsePhoneNumber` no
 * servidor — aqui é só forma. Nome é obrigatório: sem verificação e sem nome, a
 * comanda chega anônima e o lojista perde o que o WhatsApp já dava.
 */
export const guestCustomerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().min(1),
  })
  .strict();

export type StorefrontModifier = z.infer<typeof storefrontModifierSchema>;
export type StorefrontModifierGroup = z.infer<typeof storefrontModifierGroupSchema>;
export type StorefrontProduct = z.infer<typeof storefrontProductSchema>;
export type StorefrontCategory = z.infer<typeof storefrontCategorySchema>;
export type StorefrontStore = z.infer<typeof storefrontStoreSchema>;
export type StorefrontPayload = z.infer<typeof storefrontPayloadSchema>;
export type GuestCustomer = z.infer<typeof guestCustomerSchema>;
