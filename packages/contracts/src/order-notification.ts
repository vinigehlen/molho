import { z } from 'zod';
import { orderStatusSchema } from './admin-order';

export const orderNotificationChannelSchema = z.literal('whatsapp_ctc');
export type OrderNotificationChannel = z.infer<typeof orderNotificationChannelSchema>;

export const orderNotificationResponseSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  channel: orderNotificationChannelSchema,
  orderStatusSnapshot: orderStatusSchema,
  createdAt: z.iso.datetime(),
});
export type OrderNotificationResponse = z.infer<typeof orderNotificationResponseSchema>;
