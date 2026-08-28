import { z } from 'zod';
import { fulfillmentTypeSchema, paymentStatusSchema } from './checkout';

const centsSchema = z.int().nonnegative();

/**
 * TODOS os métodos que podem estar gravados em `orders.payment_method` — o
 * gestor lê pedido de QUALQUER origem (checkout do cliente OU balcão,
 * Épico balcão), então é mais largo que `paymentMethodSchema` (checkout.ts),
 * que é só o que o CLIENTE pode escolher (nunca inclui `cash_at_counter`/
 * `card_at_counter` — esses só nascem por `POST .../counter-orders`, staff-
 * only). Duas listas de propósito: alargar `paymentMethodSchema` deixaria o
 * checkout aceitar método de balcão sem querer.
 */
export const adminPaymentMethodSchema = z.enum([
  'pix',
  'cash_on_delivery',
  'card_on_delivery',
  'cash_at_counter',
  'card_at_counter',
]);
export type AdminPaymentMethod = z.infer<typeof adminPaymentMethodSchema>;

/**
 * Máquina de estados do pedido (docs/02 §5.1) — canônica aqui pro gestor
 * (Épico 9) ler o status pela rede. Espelha o enum OrderStatus do Prisma e o
 * type do lado da API (order-status-machine.ts).
 */
export const orderStatusSchema = z.enum([
  'pending_payment',
  'received',
  'preparing',
  'ready',
  'in_transit',
  'completed',
  'expired',
  'auto_canceled',
  'canceled',
  'delivery_failed',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Statuses que o gestor mostra no board. Terminais infelizes (cancelados/expired/delivery_failed) saem do board. */
export const ACTIVE_ORDER_STATUSES = ['received', 'preparing', 'ready', 'in_transit', 'completed'] as const;

export const orderDestinationSchema = z.enum(['delivery', 'pickup', 'balcao']);
export type OrderDestination = z.infer<typeof orderDestinationSchema>;

const adminOrderItemSchema = z.strictObject({
  name: z.string(),
  quantity: z.int().positive(),
  lineTotalCents: centsSchema,
  /** Pra comanda de cozinha (fallback universal, docs/02 §6) — sem preço, o gestor não mostra o delta. */
  modifiers: z.array(z.strictObject({ name: z.string() })),
  notes: z.string().nullable(),
});

/** Endereço de entrega — snapshot congelado no pedido (nunca JOIN vivo, CLAUDE.md "complexidade deliberada"). */
const adminOrderDeliverySchema = z.strictObject({
  label: z.string(),
  street: z.string(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string().nullable(),
  referencePoint: z.string().nullable(),
  /**
   * `false` quando o ViaCEP ficou mudo no checkout e a CIDADE que decidiu a
   * taxa veio do texto digitado pelo cliente. O gestor destaca pro lojista
   * conferir a taxa antes de despachar (Épico 6, Bloco 2).
   */
  postalCodeVerified: z.boolean(),
});

/**
 * Um pedido como o gestor vê (Épico 9). `changeForCents` é "troco pra quanto"
 * (só faz sentido em cash_on_delivery, mas mantido no shape plano — nullable —
 * pra não discriminar a união no board; o troco a DEVOLVER = change − total é
 * calculado na UI, nunca persistido, docs/02 §5.5). `customerName` vem do
 * JOIN com Customer (nome é claro; telefone é cifrado e NÃO entra aqui —
 * o click-to-chat do Épico 11 busca o telefone num endpoint dedicado, sob
 * demanda, pra PII não trafegar no payload do board inteiro).
 * Valor/horário/nome lado a lado alimentam a reconciliação manual do PIX.
 */
export const adminOrderSchema = z.strictObject({
  id: z.uuid(),
  status: orderStatusSchema,
  version: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  /** Nulo só para pedidos antigos, criados antes do snapshot de prazo existir. */
  fulfillmentDeadlineAt: z.iso.datetime().nullable(),
  customerName: z.string(),
  /**
   * Snapshot `orders.customer_verified` (Épico 9c): `false` = pedido guest,
   * telefone auto-declarado, nunca provado por OTP. Booleano, não PII. O
   * gestor avisa antes de mandar WhatsApp — dígito errado num pedido guest é
   * plausível, e o lojista precisa saber ANTES de contar com o aviso.
   */
  customerVerified: z.boolean(),
  paymentMethod: adminPaymentMethodSchema,
  paymentStatus: paymentStatusSchema,
  changeForCents: centsSchema.nullable(),
  subtotalCents: centsSchema,
  deliveryFeeCents: centsSchema,
  totalCents: centsSchema,
  /**
   * Total ATUAL depois de ajustes do balcão (Épico balcão — edição de
   * pedido) — `null` quando o pedido nunca foi ajustado. O gestor exibe
   * `currentTotalCents ?? totalCents`, NUNCA soma os dois nem ignora este
   * campo quando presente — `totalCents` acima continua congelado como
   * "o que foi cobrado na criação".
   */
  currentTotalCents: centsSchema.nullable(),
  fulfillmentType: fulfillmentTypeSchema,
  destination: orderDestinationSchema,
  /** `null` quando `fulfillmentType === 'pickup'` — retira no endereço da PRÓPRIA loja, que o lojista já sabe de cor. */
  delivery: adminOrderDeliverySchema.nullable(),
  items: z.array(adminOrderItemSchema),
  /**
   * Sinalização manual de pendência (Fase 3, plano do gestor) — `null` =
   * não sinalizado. Não é status nem bloqueia transição, é só destaque/filtro
   * visual no board (staff marcando "esse pedido precisa de atenção" na mão).
   */
  flaggedAt: z.iso.datetime().nullable(),
  flaggedReason: z.string().nullable(),
});
export type AdminOrder = z.infer<typeof adminOrderSchema>;
export type AdminOrderItem = z.infer<typeof adminOrderItemSchema>;
