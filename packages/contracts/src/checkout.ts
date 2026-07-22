/**
 * Contrato do checkout (Épico 7).
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
 * lat/lng são OBRIGATÓRIOS aqui — diferente do `CustomerAddress` de
 * navegação (Épico 6), que aceita endereço só em texto. Checkout exige
 * cobertura de entrega confirmada; não há pickup neste épico (débito
 * adiado, ver schema.prisma).
 */
export const checkoutAddressInputSchema = z.object({
  label: z.string(),
  street: z.string(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string().nullable(),
  referencePoint: z.string().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
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

export const checkoutRequestSchema = z.object({
  items: z.array(checkoutItemInputSchema).min(1),
  address: checkoutAddressInputSchema,
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
  withinZone: z.boolean(),
  /** `null` quando `withinZone: false` — não existe taxa fora da área. */
  deliveryFeeCents: centsSchema.nullable(),
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

export const checkoutOrderResponseSchema = z.object({
  orderId: z.uuid(),
  status: z.literal('received'),
  paymentStatus: z.literal('aguardando_confirmacao'),
  totalCents: centsSchema,
});

export type CheckoutItemInput = z.infer<typeof checkoutItemInputSchema>;
export type CheckoutAddressInput = z.infer<typeof checkoutAddressInputSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type RevalidatedItem = z.infer<typeof revalidatedItemSchema>;
export type RevalidatedCheckout = z.infer<typeof revalidatedCheckoutSchema>;
export type CheckoutOrderResponse = z.infer<typeof checkoutOrderResponseSchema>;
