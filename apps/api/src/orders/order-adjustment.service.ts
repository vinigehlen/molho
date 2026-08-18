import type { OrderAdjustmentInput, OrderAdjustmentResponse } from '@molho/contracts';
import { CounterOrderProductNotFoundError, MissingIdempotencyKeyError } from './counter-order.errors';
import { OrderAdjustmentItemNotFoundError, OrderNotEditableError } from './order-adjustment.errors';
import { OrderNotFoundError } from './order-errors';
import type { OrderAdjustmentRepository } from './order-adjustment.repository';
import type { OrderStatus } from './order-status-machine';

/** Status em que o gestor ainda pode mexer nos itens do pedido (docs/balcao/contrato-mutacao-pedido.md, Decisão 3, escopo aprovado). */
const EDITABLE_STATUSES: readonly OrderStatus[] = ['received', 'preparing', 'ready'];

export interface OrderAdjustmentActor {
  id: string;
  role: string;
}

interface AppliedItemChange {
  orderItemId: string;
  quantityDelta: number;
  subtotalDeltaCents: number;
}

export class OrderAdjustmentService {
  constructor(private readonly repo: OrderAdjustmentRepository) {}

  async applyAdjustment(
    tenantId: string,
    storeId: string,
    orderId: string,
    input: OrderAdjustmentInput,
    idempotencyKey: string | undefined,
    actor: OrderAdjustmentActor,
  ): Promise<OrderAdjustmentResponse> {
    if (!idempotencyKey) throw new MissingIdempotencyKeyError();

    const order = await this.repo.findOrderForAdjustment(orderId);
    // `storeId` da URL não bate: mesma ambiguidade de propósito de RLS —
    // pedido de outra loja do MESMO tenant não deveria ser alcançável por
    // esta rota, e o cliente não distingue "não existe" de "não é desta loja".
    if (!order || order.storeId !== storeId) throw new OrderNotFoundError();

    // Fast path do retry: mesma chave, mesmo pedido — nem repriça, nem cria
    // item novo à toa. Devolve o total ATUAL do pedido (não um snapshot do
    // momento daquele ajuste — ver comentário em order-adjustment.repository).
    if (await this.repo.hasIdempotencyKey(orderId, idempotencyKey)) {
      return toResponse(orderId, order);
    }

    if (!EDITABLE_STATUSES.includes(order.status)) throw new OrderNotEditableError(order.status);

    // Lock ANTES de recalcular — fecha a corrida de dois ajustes concorrentes
    // no MESMO pedido lendo o mesmo total base e se sobrescrevendo (mesmo
    // racional de lockProductsForUpdate() no checkout, CLAUDE.md "complexidade
    // deliberada"). Sem `expectedVersion` no contrato: o lock substitui o
    // optimistic lock aqui, o cliente não precisa mandar a versão do pedido.
    const locked = await this.repo.lockOrderForUpdate(orderId);

    const change = await this.applyItemChange(orderId, input);

    const baseSubtotalCents = locked.currentSubtotalCents ?? locked.subtotalCents;
    const newSubtotalCents = baseSubtotalCents + change.subtotalDeltaCents;
    const newTotalCents = newSubtotalCents + locked.deliveryFeeCents;

    const { inserted } = await this.repo.insertAdjustment({
      orderId,
      orderItemId: change.orderItemId,
      kind: input.kind,
      quantityDelta: change.quantityDelta,
      subtotalDeltaCents: change.subtotalDeltaCents,
      actorId: actor.id,
      actorRole: actor.role,
      idempotencyKey,
    });

    if (inserted) {
      await this.repo.updateOrderCurrentTotals(orderId, newSubtotalCents, newTotalCents);
      // Ação sensível (dinheiro, CLAUDE.md regra 9) — audit_log sempre.
      await this.repo.recordAuditLog({
        tenantId,
        actorId: actor.id,
        actorRole: actor.role,
        orderId,
        kind: input.kind,
        beforeSubtotalCents: baseSubtotalCents,
        afterSubtotalCents: newSubtotalCents,
      });
      return { orderId, currentSubtotalCents: newSubtotalCents, currentTotalCents: newTotalCents };
    }

    // inserted === false: perdeu a corrida do ON CONFLICT — uma request
    // CONCORRENTE com a MESMA chave ganhou entre o hasIdempotencyKey() (fora
    // do lock) e o INSERT (dentro dele). O item que ESTA tentativa criou
    // (add_item) ou mirou fica órfão de ajuste — aceitável: é o preço de não
    // exigir expectedVersion no contrato, e o cenário é raríssimo (2 retries
    // exatos do mesmo intent na mesma janela de milissegundos).
    const fresh = await this.repo.findOrderForAdjustment(orderId);
    if (!fresh) throw new OrderNotFoundError();
    return toResponse(orderId, fresh);
  }

  /** Resolve o `orderItemId`/deltas de CADA kind — item efetivo (original ± ajustes prévios), nunca a linha crua de order_items. */
  private async applyItemChange(orderId: string, input: OrderAdjustmentInput): Promise<AppliedItemChange> {
    if (input.kind === 'add_item') {
      return this.applyAddItem(orderId, input);
    }

    const state = await this.repo.findOrderItemState(orderId, input.orderItemId);
    if (!state || state.effectiveQuantity <= 0) throw new OrderAdjustmentItemNotFoundError(input.orderItemId);

    if (input.kind === 'remove_item') {
      return {
        orderItemId: state.id,
        quantityDelta: -state.effectiveQuantity,
        subtotalDeltaCents: -state.effectiveLineTotalCents,
      };
    }

    // change_qty — preço unitário é IMUTÁVEL (unitBasePriceCents nunca muda,
    // mesmo que o catálogo mude depois), só a quantidade final é nova.
    const newLineTotalCents = state.unitBasePriceCents * input.newQuantity;
    return {
      orderItemId: state.id,
      quantityDelta: input.newQuantity - state.effectiveQuantity,
      subtotalDeltaCents: newLineTotalCents - state.effectiveLineTotalCents,
    };
  }

  /**
   * `add_item` é sempre UNITÁRIO (contrato não aceita `weighed` aqui — item
   * pesado em pedido já aberto é fora de escopo). Preço SEMPRE do catálogo,
   * mesma fórmula de counter-order: (basePriceCents + Σ deltas dos
   * modifiers) × quantity.
   */
  private async applyAddItem(
    orderId: string,
    input: Extract<OrderAdjustmentInput, { kind: 'add_item' }>,
  ): Promise<AppliedItemChange> {
    const products = await this.repo.findProducts([input.productId]);
    const product = products.get(input.productId);
    if (!product) throw new CounterOrderProductNotFoundError(input.productId);

    const modifierIds = input.modifiers ?? [];
    const modifiers = modifierIds.length > 0 ? await this.repo.findModifiers(modifierIds) : new Map();
    const chosenModifiers = modifierIds.map((modifierId) => {
      const modifier = modifiers.get(modifierId);
      if (!modifier) throw new CounterOrderProductNotFoundError(modifierId);
      return { modifierId, name: modifier.name, priceDeltaCents: modifier.priceDeltaCents };
    });

    const unitBasePriceCents = product.basePriceCents + chosenModifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
    const lineTotalCents = unitBasePriceCents * input.quantity;

    const orderItemId = await this.repo.createOrderItem({
      orderId,
      productId: input.productId,
      name: product.name,
      unitBasePriceCents,
      quantity: input.quantity,
      lineTotalCents,
      modifiers: chosenModifiers,
    });

    return { orderItemId, quantityDelta: input.quantity, subtotalDeltaCents: lineTotalCents };
  }
}

function toResponse(
  orderId: string,
  order: { currentSubtotalCents: number | null; currentTotalCents: number | null; subtotalCents: number; deliveryFeeCents: number },
): OrderAdjustmentResponse {
  return {
    orderId,
    currentSubtotalCents: order.currentSubtotalCents ?? order.subtotalCents,
    currentTotalCents: order.currentTotalCents ?? order.subtotalCents + order.deliveryFeeCents,
  };
}
