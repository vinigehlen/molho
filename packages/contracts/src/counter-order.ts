/**
 * Contrato do pedido de BALCÃO (walk-in create, "Épico balcão") — staff bate
 * o pedido direto no caixa, já pago e já entregue na hora. Duas naturezas de
 * item, nunca misturadas na mesma linha:
 *
 * - `unit`: produto normal do cardápio, por quantidade. PREÇO NUNCA VEM DO
 *   CLIENTE — o corpo só manda `productId`+`quantity`(+modifiers escolhidos,
 *   também só por id); o valor é sempre lido do catálogo no servidor
 *   (mesmo princípio de checkout: preço nunca é confiança no cliente).
 * - `weighed`: item pesado na balança do próprio balcão (queijo, carne por
 *   kg…) — aqui SIM o valor vem de fora (`lineTotalCents`), porque só quem
 *   está na balança sabe o peso × preço/kg no momento. É "confiança no
 *   operador do POS", não "confiança no cliente" — por isso o serviço aplica
 *   um teto (CLAUDE.md § dinheiro em centavos, nunca sem guarda-corpo).
 */

import { z } from 'zod';
import { orderStatusSchema } from './admin-order';

export const counterUnitItemSchema = z.strictObject({
  kind: z.literal('unit'),
  productId: z.uuid(),
  quantity: z.int().min(1),
  /** Só os IDs escolhidos — preço do modifier também vem do catálogo, nunca do body. */
  modifiers: z.array(z.uuid()).optional(),
});
export type CounterUnitItemInput = z.infer<typeof counterUnitItemSchema>;

export const counterWeighedItemSchema = z.strictObject({
  kind: z.literal('weighed'),
  productId: z.uuid(),
  weightGrams: z.int().min(1),
  /** Valor mandado pela balança/POS — validado contra um teto no serviço, não aqui (mensagem de erro dedicada). */
  lineTotalCents: z.int().min(1),
});
export type CounterWeighedItemInput = z.infer<typeof counterWeighedItemSchema>;

export const counterOrderItemSchema = z.discriminatedUnion('kind', [counterUnitItemSchema, counterWeighedItemSchema]);
export type CounterOrderItemInput = z.infer<typeof counterOrderItemSchema>;

/** PIX de balcão reusa o valor `pix` — mesmo QR/confirmação manual do delivery, só muda onde o cliente está parado. */
export const counterOrderPaymentMethodSchema = z.enum(['pix', 'cash_at_counter', 'card_at_counter']);
export type CounterOrderPaymentMethod = z.infer<typeof counterOrderPaymentMethodSchema>;

/**
 * Cadastro de cliente no balcão. Quando presente, o pedido é vinculado a um
 * `customer` DE VERDADE (nome + telefone + e-mail), não ao customer anônimo
 * "Balcão". A identidade continua sendo o TELEFONE (mesma regra de todo o
 * resto — `customer-identity.repository.ts`): telefone igual, no mesmo tenant,
 * reaproveita o registro e o pedido entra no histórico do cliente que volta.
 * `phone` chega como o operador digitou; a API normaliza pra E.164.
 * `email` é opcional de propósito — exigir e-mail no caixa trava venda; a UI
 * pede, o contrato não bloqueia.
 */
export const counterOrderCustomerSchema = z.strictObject({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().min(1).max(40),
});
export type CounterOrderCustomerInput = z.infer<typeof counterOrderCustomerSchema>;

export const counterOrderSchema = z
  .strictObject({
    items: z.array(counterOrderItemSchema).min(1),
    paymentMethod: counterOrderPaymentMethodSchema,
    /** Nome pra chamar no balcão — sem ele, o pedido chama só "Balcão" (customer anônimo, sem telefone/e-mail). */
    customerName: z.string().trim().min(1).max(120).optional(),
    /** Cadastro completo do cliente (Nome, Sobrenome, E-mail, Telefone). Tem precedência sobre `customerName`. */
    customer: counterOrderCustomerSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => !(value.customer && value.customerName), {
    message: 'Envie customer OU customerName, nunca os dois.',
    path: ['customerName'],
  });
export type CounterOrderInput = z.infer<typeof counterOrderSchema>;

/** Busca por prefixo de nome pro autopreenchimento do balcão (staff autorizado — telefone/e-mail vêm em claro). */
export const customerSearchResultSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});
export type CustomerSearchResult = z.infer<typeof customerSearchResultSchema>;
export const customerSearchResponseSchema = z.array(customerSearchResultSchema);

export const counterOrderResponseSchema = z.strictObject({
  orderId: z.uuid(),
  status: orderStatusSchema,
  paymentStatus: z.literal('confirmado'),
  paymentMethod: counterOrderPaymentMethodSchema,
  subtotalCents: z.int(),
  totalCents: z.int(),
});
export type CounterOrderResponse = z.infer<typeof counterOrderResponseSchema>;
