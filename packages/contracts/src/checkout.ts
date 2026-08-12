/**
 * Contrato do checkout (Épico 7) + método de pagamento (Épico 8, docs/02 §5.5).
 *
 * Dois endpoints, mesmo par de schemas de entrada/saída:
 *
 *   1. `POST /v1/store/:slug/checkout/revalidate` — PÚBLICO, anônimo.
 *      Alimenta a tela de revisão (carrinho + endereço ainda no
 *      `localStorage`, sem OTP — CLAUDE.md regra 13). Devolve os valores
 *      FRESCOS do servidor e as divergências em relação ao que o cliente
 *      mandou.
 *   2. `POST /v1/store/:slug/checkout/orders` — autenticado (JWT do
 *      customer, ganho no OTP do "Fazer pedido"). MESMO input, revalida de
 *      novo internamente (nunca confia no resultado da chamada 1, por mais
 *      recente que seja) e só cria o pedido se não sobrou nenhuma
 *      divergência desfavorável.
 *
 * `hasUnfavorableDivergence` é o campo que decide a UI (CLAUDE.md regra
 * 14): `true` → tela de confirmação obrigatória. Preço caindo, ou taxa
 * mantendo/caindo, nunca entra aqui — é só toast informativo, o cliente
 * nunca precisa confirmar pra pagar MENOS.
 */

import { z } from 'zod';
import type { ModuleKey } from './modules';
import { normalizePostalCode } from './postal-code';

const centsSchema = z.int().nonnegative();

/**
 * `unitBasePriceCents`/`modifiers[].priceDeltaCents` são o preço que o
 * CLIENTE tem em cache (o carrinho de `@molho/contracts/cart.ts`) — não são
 * usados pra calcular nada, só pra revalidação comparar contra o preço
 * FRESCO do banco e decidir `revalidatedItemSchema.priceChanged`. Sem isso
 * aqui, o servidor não teria contra o que comparar (achado escrevendo o
 * serviço de revalidação: o schema original só tinha `modifierIds`, e
 * "mudou desde o que o cliente mandou" não fazia sentido sem o cliente
 * mandar o preço).
 */
export const checkoutItemInputSchema = z.object({
  productId: z.uuid(),
  unitBasePriceCents: z.int().nonnegative(),
  modifiers: z.array(z.object({ modifierId: z.uuid(), priceDeltaCents: z.int().nonnegative() })),
  quantity: z.int().positive(),
  notes: z.string().max(280).nullable(),
});

/**
 * O cliente NUNCA manda lat/lng (Épico 6, Bloco 2 — "Mundo A"): ele digita
 * CEP + número, e o SERVIDOR deriva cidade, rua e ponto (ViaCEP + Nominatim,
 * no middleware de geocode). A taxa vem da CIDADE, não do ponto — zona de
 * entrega é por município.
 *
 * `street`/`neighborhood`/`city`/`state` continuam aqui como FALLBACK DE
 * TEXTO: o servidor sobrescreve cada um com o valor do ViaCEP quando ele
 * responde, e só usa o que veio do cliente pro que faltar (ver
 * `resolveAddress` na API). Podem chegar vazios — é o caso normal quando o
 * ViaCEP respondeu no browser e o cliente não editou nada.
 */
export const checkoutAddressInputSchema = z.object({
  label: z.string(),
  /** Aceita "93610-000" ou "93610000" — a normalização é do servidor. */
  postalCode: z.string().refine((raw) => normalizePostalCode(raw) !== null, 'CEP precisa ter 8 dígitos'),
  /** Obrigatório: sem número não há entrega. `"s/n"` é um valor válido, não ausência. */
  number: z.string().min(1),
  complement: z.string().nullable(),
  street: z.string(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  referencePoint: z.string().nullable(),
  /**
   * Taxa que o cliente viu no `MoAddressSheet` (Épico 6) ao escolher este
   * endereço — mesma razão de `checkoutItemInputSchema.unitBasePriceCents`:
   * sem isso, a revalidação não tem contra o que comparar pra saber se a
   * taxa SUBIU (regra 14). `null` no caso raro de o cliente forçar checkout
   * sem ter visto o match de zona ainda (ex.: endereço colado direto no
   * campo, sem passar pelo fluxo normal).
   */
  expectedDeliveryFeeCents: centsSchema.nullable(),
});

/**
 * Retirada no balcão (docs/03 §4, docs/04 §"Checkout" — previsto desde o
 * desenho original, MVP nasceu delivery-only). `pickup` usa o endereço da
 * PRÓPRIA loja (o lojista já sabe de cor); o cliente nunca digita CEP.
 */
export const fulfillmentTypeSchema = z.enum(['delivery', 'pickup']);

export const paymentMethodSchema = z.enum(['pix', 'cash_on_delivery', 'card_on_delivery']);

/**
 * Ciclo de vida do pagamento (docs/02 §5.5): só 2 estados, método-agnóstico.
 * `aguardando_confirmacao` → `confirmado`, sem terceiro estado (cancelamento
 * vive no eixo OrderStatus + refundStatus). Espelha o enum PaymentStatus do
 * Prisma — canônico aqui pra o gestor de pedidos (Épico 9) e o gate de
 * pagamento consumirem sem depender do tipo gerado pelo ORM.
 */
export const paymentStatusSchema = z.enum(['aguardando_confirmacao', 'confirmado']);

/**
 * Fonte única do mapeamento método → módulo de entitlement — usado tanto
 * pelo gate de criação de pedido (checkout, service dinâmico) quanto pelo
 * cálculo de `availablePaymentMethods` (storefront público). Duplicar isso
 * nos dois lugares é exatamente o tipo de coisa que diverge silenciosamente
 * depois de um módulo novo. Ver docs/02-definicoes-v1.md §5.5.
 */
export const PAYMENT_METHOD_MODULE: Record<z.infer<typeof paymentMethodSchema>, ModuleKey> = {
  pix: 'payments.pix_static',
  cash_on_delivery: 'payments.on_delivery',
  card_on_delivery: 'payments.on_delivery',
};

const checkoutRequestBase = z.object({
  items: z.array(checkoutItemInputSchema).min(1),
  fulfillmentType: fulfillmentTypeSchema,
  /**
   * `null` só é válido quando `fulfillmentType === 'pickup'` (refine abaixo,
   * fora da union — precisa ver os dois campos juntos). `delivery` sem
   * endereço, ou `pickup` COM endereço, são os dois request malformado.
   */
  address: checkoutAddressInputSchema.nullable(),
});

/**
 * Union discriminada por `paymentMethod` (Épico 8), não campo solto — o
 * mesmo racional de `checkoutOrderResponseSchema.pix` abaixo: `changeForCents`
 * só EXISTE estruturalmente no branch `cash_on_delivery`, nunca aparece
 * (nem `null`) em `pix`/`card_on_delivery`. Granular (dinheiro ≠ cartão na
 * maquininha) porque são operações diferentes na ponta pro Épico 9 (troco
 * vs nada) — ambos dependem do mesmo módulo `payments.on_delivery`, mas
 * isso é detalhe de entitlement, não de contrato de request. Ver
 * docs/02-definicoes-v1.md §5.5.
 */
// .strict() em cada branch: changeForCents mandado com paymentMethod !== 'cash_on_delivery'
// é request malformado, rejeitado — não silenciosamente descartado (comportamento
// "strip" default do zod pra chave desconhecida).
export const checkoutRequestSchema = z
  .discriminatedUnion('paymentMethod', [
    checkoutRequestBase.extend({ paymentMethod: z.literal('pix') }).strict(),
    checkoutRequestBase
      .extend({
        paymentMethod: z.literal('cash_on_delivery'),
        /** "Troco pra quanto" — o valor que o cliente vai entregar (ex.: paga R$47 com uma nota de R$50 → 5000), NÃO o troco em si (isso é `changeForCents - totalCents`, calculado na hora de exibir). `null` = não precisa de troco. */
        changeForCents: centsSchema.nullable(),
      })
      .strict(),
    checkoutRequestBase.extend({ paymentMethod: z.literal('card_on_delivery') }).strict(),
  ])
  // Fora da union (as 3 branches são só sobre paymentMethod): endereço
  // presente SE E SOMENTE SE for entrega. Pickup com address preenchido não
  // é "ignorado com segurança" — é o cliente achando que mandou um endereço
  // que o servidor nunca vai olhar, silenciosamente. Rejeita os dois lados.
  .refine((data) => (data.fulfillmentType === 'delivery') === (data.address !== null), {
    message: 'Entrega exige endereço; retirada não pode vir com endereço.',
    path: ['address'],
  });

export const revalidatedItemSchema = z.object({
  productId: z.uuid(),
  name: z.string(),
  /** `false` = sumiu do carrinho nesta revalidação (esgotado, ou removido do catálogo). */
  available: z.boolean(),
  unitBasePriceCents: centsSchema,
  modifiers: z.array(
    z.object({ modifierId: z.uuid(), name: z.string(), priceDeltaCents: centsSchema }),
  ),
  quantity: z.int().positive(),
  notes: z.string().nullable(),
  lineTotalCents: centsSchema,
  /** Preço (produto ou modificador) mudou desde o que o cliente mandou. */
  priceChanged: z.boolean(),
});

export const revalidatedCheckoutSchema = z.object({
  items: z.array(revalidatedItemSchema),
  subtotalCents: centsSchema,
  /** Em pickup sempre `true` — não existe zona pra quem retira no balcão. */
  withinZone: z.boolean(),
  /** `null` quando `withinZone: false`. Sempre `0` em pickup (nunca `null` — pickup nunca é "fora da área"). */
  deliveryFeeCents: centsSchema.nullable(),
  /** Sempre `null` em pickup — não há ETA de entrega pra estimar. */
  etaMinMinutes: z.int().nonnegative().nullable(),
  etaMaxMinutes: z.int().nonnegative().nullable(),
  isOpenNow: z.boolean(),
  nextOpensAt: z.iso.datetime({ offset: true }).nullable(),
  minOrderCents: centsSchema,
  /** `null` quando `withinZone: false` (não dá pra somar taxa que não existe). */
  totalCents: centsSchema.nullable(),
  /**
   * `true` se QUALQUER item ficou indisponível, ou algum preço/taxa SUBIU,
   * ou a loja fechou, ou saiu da zona, ou ficou abaixo do mínimo — qualquer
   * coisa que precise de confirmação ativa (regra 14). Preço caindo não
   * conta.
   */
  hasUnfavorableDivergence: z.boolean(),
  /** `false` se fora da zona, fechada, abaixo do mínimo, ou carrinho vazio após remover indisponíveis — bloqueia o botão de confirmar, mesmo que o cliente ainda não tenha visto a divergência. */
  canSubmit: z.boolean(),
});

/**
 * Pagamento (Épico 8) — PIX estático, chave do lojista, sem PSP. `payload` é
 * o BR Code completo (`@molho/contracts/pix.ts`): o storefront renderiza o
 * QR a partir dele E mostra como copia-e-cola, mesmo string pras duas
 * coisas. `key`/`keyType` só pra exibição humana ("chave: fulano@banco.com,
 * tipo e-mail") — o payload já embute a chave, isto aqui não é usado pra
 * montar nada.
 */
export const checkoutOrderPixSchema = z.object({
  payload: z.string(),
  key: z.string(),
  keyType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']),
});

const checkoutOrderResponseBase = z.object({
  orderId: z.uuid(),
  status: z.literal('received'),
  paymentStatus: z.literal('aguardando_confirmacao'),
  totalCents: centsSchema,
});

/** Mesma union de `checkoutRequestSchema`, mesmo racional — `pix` só existe no branch `pix`, `changeForCents` só no branch `cash_on_delivery`. */
export const checkoutOrderResponseSchema = z.discriminatedUnion('paymentMethod', [
  checkoutOrderResponseBase.extend({ paymentMethod: z.literal('pix'), pix: checkoutOrderPixSchema }).strict(),
  checkoutOrderResponseBase
    .extend({ paymentMethod: z.literal('cash_on_delivery'), changeForCents: centsSchema.nullable() })
    .strict(),
  checkoutOrderResponseBase.extend({ paymentMethod: z.literal('card_on_delivery') }).strict(),
]);

export type FulfillmentType = z.infer<typeof fulfillmentTypeSchema>;
export type CheckoutItemInput = z.infer<typeof checkoutItemInputSchema>;
export type CheckoutAddressInput = z.infer<typeof checkoutAddressInputSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type RevalidatedItem = z.infer<typeof revalidatedItemSchema>;
export type RevalidatedCheckout = z.infer<typeof revalidatedCheckoutSchema>;
export type CheckoutOrderPix = z.infer<typeof checkoutOrderPixSchema>;
export type CheckoutOrderResponse = z.infer<typeof checkoutOrderResponseSchema>;
