import { z } from 'zod';
import { paymentMethodSchema, paymentStatusSchema } from './checkout';

const centsSchema = z.int().nonnegative();

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

/** Statuses ATIVOS que o gestor mostra no board (não-terminais). Terminais (completed/cancelados/expired/delivery_failed) saem do board. */
export const ACTIVE_ORDER_STATUSES = ['received', 'preparing', 'ready', 'in_transit'] as const;

const adminOrderItemSchema = z.object({
  name: z.string(),
  quantity: z.int().positive(),
  lineTotalCents: centsSchema,
});

/** Endereço de entrega — snapshot congelado no pedido (nunca JOIN vivo, CLAUDE.md "complexidade deliberada"). */
const adminOrderDeliverySchema = z.object({
  label: z.string(),
  street: z.string(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string().nullable(),
  referencePoint: z.string().nullable(),
});

/**
 * Um pedido como o gestor vê (Épico 9). `changeForCents` é "troco pra quanto"
 * (só faz sentido em cash_on_delivery, mas mantido no shape plano — nullable —
 * pra não discriminar a união no board; o troco a DEVOLVER = change − total é
 * calculado na UI, nunca persistido, docs/02 §5.5). `customerName` vem do
 * JOIN com Customer (nome é claro; telefone é cifrado e NÃO entra aqui).
 * Valor/horário/nome lado a lado alimentam a reconciliação manual do PIX.
 */
export const adminOrderSchema = z.object({
  id: z.uuid(),
  status: orderStatusSchema,
  version: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  customerName: z.string(),
  paymentMethod: paymentMethodSchema,
  paymentStatus: paymentStatusSchema,
  changeForCents: centsSchema.nullable(),
  subtotalCents: centsSchema,
  deliveryFeeCents: centsSchema,
  totalCents: centsSchema,
  delivery: adminOrderDeliverySchema,
  items: z.array(adminOrderItemSchema),
});
export type AdminOrder = z.infer<typeof adminOrderSchema>;
export type AdminOrderItem = z.infer<typeof adminOrderItemSchema>;
