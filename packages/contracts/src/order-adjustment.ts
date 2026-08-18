/**
 * Contrato de ajuste de pedido do BALCÃO (edição de pedido já criado,
 * "Épico balcão — order edit") — docs/balcao/contrato-mutacao-pedido.md
 * resolvido pro escopo mínimo: 3 operações, uma por chamada (nunca lote).
 *
 * `add_item` é sempre UNITÁRIO (mesma restrição de counter-order): PREÇO
 * NUNCA VEM DO CLIENTE — só productId+quantity(+modifiers, também só por
 * id), o valor é sempre lido do catálogo no servidor. Item PESADO em
 * pedido já aberto é fora de escopo (docs do épico).
 *
 * `remove_item` é sempre integral — remove o item inteiro, não uma
 * quantidade parcial (diferente da "Decisão 8" da proposta original, que
 * previa remoção parcial; o escopo aprovado simplificou pra remoção
 * completa, `change_qty` cobre reduzir sem remover).
 */

import { z } from 'zod';

export const orderAdjustmentAddItemSchema = z.object({
  kind: z.literal('add_item'),
  productId: z.uuid(),
  quantity: z.int().min(1),
  /** Só os IDs escolhidos — preço do modifier também vem do catálogo, nunca do body (mesmo princípio de counter-order). */
  modifiers: z.array(z.uuid()).optional(),
});
export type OrderAdjustmentAddItemInput = z.infer<typeof orderAdjustmentAddItemSchema>;

export const orderAdjustmentRemoveItemSchema = z.object({
  kind: z.literal('remove_item'),
  orderItemId: z.uuid(),
});
export type OrderAdjustmentRemoveItemInput = z.infer<typeof orderAdjustmentRemoveItemSchema>;

export const orderAdjustmentChangeQtySchema = z.object({
  kind: z.literal('change_qty'),
  orderItemId: z.uuid(),
  /** Nova quantidade final do item — nunca um delta. Mínimo 1: zerar é `remove_item`, não `change_qty` com 0. */
  newQuantity: z.int().min(1),
});
export type OrderAdjustmentChangeQtyInput = z.infer<typeof orderAdjustmentChangeQtySchema>;

export const orderAdjustmentSchema = z.discriminatedUnion('kind', [
  orderAdjustmentAddItemSchema,
  orderAdjustmentRemoveItemSchema,
  orderAdjustmentChangeQtySchema,
]);
export type OrderAdjustmentInput = z.infer<typeof orderAdjustmentSchema>;
/** Espelha o enum `OrderAdjustmentKind` do Prisma — a coluna `order_adjustments.kind`. */
export type OrderAdjustmentKind = OrderAdjustmentInput['kind'];

/** Totais ATUAIS do pedido depois do ajuste — o gestor substitui o total exibido por este, sem refazer o cálculo no cliente. */
export const orderAdjustmentResponseSchema = z.object({
  orderId: z.uuid(),
  currentSubtotalCents: z.int(),
  currentTotalCents: z.int(),
});
export type OrderAdjustmentResponse = z.infer<typeof orderAdjustmentResponseSchema>;
