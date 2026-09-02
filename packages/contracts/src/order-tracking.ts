import { z } from 'zod';
import { fulfillmentTypeSchema } from './checkout';
import { orderStatusSchema } from './admin-order';

const centsSchema = z.int().nonnegative();

export const orderTrackingTokenSchema = z.uuid();

export const ORDER_TRACKING_TERMINAL_STATUSES = [
  'completed',
  'canceled',
  'delivery_failed',
  'expired',
  'auto_canceled',
] as const;

/**
 * Payload público da página de acompanhamento (Épico 12).
 *
 * Não carrega telefone, endereço completo, ator staff, papel, motivo interno
 * da timeline ou qualquer dado de backoffice. `canceledReason` é público de
 * propósito: é a explicação que o cliente precisa quando o pedido morre.
 */
export const orderTrackingResponseSchema = z.strictObject({
  orderId: z.uuid(),
  status: orderStatusSchema,
  fulfillmentType: fulfillmentTypeSchema,
  fulfillmentDeadlineAt: z.iso.datetime().nullable(),
  totalCents: centsSchema,
  canceledReason: z.string().nullable(),
  items: z.array(
    z.strictObject({
      name: z.string(),
      quantity: z.int().positive(),
    }),
  ),
  timeline: z.array(
    z.strictObject({
      status: orderStatusSchema,
      at: z.iso.datetime(),
    }),
  ),
});

export type OrderTrackingResponse = z.infer<typeof orderTrackingResponseSchema>;
