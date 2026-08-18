import type { OrderAdjustmentInput } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import { CounterOrderProductNotFoundError, MissingIdempotencyKeyError } from './counter-order.errors';
import { OrderAdjustmentItemNotFoundError, OrderNotEditableError } from './order-adjustment.errors';
import { OrderNotFoundError } from './order-errors';
import type { OrderAdjustmentRepository, OrderForAdjustment } from './order-adjustment.repository';
import { OrderAdjustmentService } from './order-adjustment.service';

const TENANT_ID = 'tenant-1';
const STORE_ID = 'store-1';
const ORDER_ID = 'order-1';
const PRODUCT_ID = 'product-1';
const MODIFIER_ID = 'modifier-1';
const ORDER_ITEM_ID = 'item-1';
const ACTOR = { id: 'staff-1', role: 'manager' };

function order(overrides: Partial<OrderForAdjustment> = {}): OrderForAdjustment {
  return {
    id: ORDER_ID,
    storeId: STORE_ID,
    status: 'preparing',
    subtotalCents: 3200,
    deliveryFeeCents: 490,
    currentSubtotalCents: null,
    currentTotalCents: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<OrderAdjustmentRepository> = {}): OrderAdjustmentRepository {
  return {
    findOrderForAdjustment: vi.fn().mockResolvedValue(order()),
    hasIdempotencyKey: vi.fn().mockResolvedValue(false),
    lockOrderForUpdate: vi.fn().mockResolvedValue(order()),
    findOrderItemState: vi
      .fn()
      .mockResolvedValue({ id: ORDER_ITEM_ID, unitBasePriceCents: 800, effectiveQuantity: 2, effectiveLineTotalCents: 1600 }),
    findProducts: vi.fn().mockResolvedValue(new Map([[PRODUCT_ID, { id: PRODUCT_ID, name: 'Coxinha', basePriceCents: 800 }]])),
    findModifiers: vi.fn().mockResolvedValue(new Map()),
    createOrderItem: vi.fn().mockResolvedValue('new-item-1'),
    insertAdjustment: vi.fn().mockResolvedValue({ inserted: true }),
    updateOrderCurrentTotals: vi.fn().mockResolvedValue(undefined),
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const addItemInput = (overrides: Partial<Extract<OrderAdjustmentInput, { kind: 'add_item' }>> = {}): OrderAdjustmentInput => ({
  kind: 'add_item',
  productId: PRODUCT_ID,
  quantity: 2,
  ...overrides,
});

describe('OrderAdjustmentService.applyAdjustment', () => {
  it('sem Idempotency-Key: MissingIdempotencyKeyError, nunca toca no banco', async () => {
    const repo = makeRepo();
    const service = new OrderAdjustmentService(repo);

    await expect(
      service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, addItemInput(), undefined, ACTOR),
    ).rejects.toThrow(MissingIdempotencyKeyError);
    expect(repo.findOrderForAdjustment).not.toHaveBeenCalled();
  });

  it('pedido inexistente: OrderNotFoundError', async () => {
    const repo = makeRepo({ findOrderForAdjustment: vi.fn().mockResolvedValue(null) });
    const service = new OrderAdjustmentService(repo);

    await expect(
      service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, addItemInput(), 'idem-1', ACTOR),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('pedido de OUTRA loja (mesmo tenant): OrderNotFoundError, mesma ambiguidade de propósito de RLS', async () => {
    const repo = makeRepo({ findOrderForAdjustment: vi.fn().mockResolvedValue(order({ storeId: 'store-outra' })) });
    const service = new OrderAdjustmentService(repo);

    await expect(
      service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, addItemInput(), 'idem-1', ACTOR),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it.each(['completed', 'canceled', 'pending_payment', 'in_transit'] as const)(
    'pedido em status "%s" (fora de received/preparing/ready): OrderNotEditableError (409)',
    async (status) => {
      const repo = makeRepo({ findOrderForAdjustment: vi.fn().mockResolvedValue(order({ status })) });
      const service = new OrderAdjustmentService(repo);

      await expect(
        service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, addItemInput(), 'idem-1', ACTOR),
      ).rejects.toThrow(OrderNotEditableError);
      expect(repo.lockOrderForUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(['received', 'preparing', 'ready'] as const)('status "%s" aceita ajuste', async (status) => {
    const repo = makeRepo({
      findOrderForAdjustment: vi.fn().mockResolvedValue(order({ status })),
      lockOrderForUpdate: vi.fn().mockResolvedValue(order({ status })),
    });
    const service = new OrderAdjustmentService(repo);

    await expect(
      service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, addItemInput(), 'idem-1', ACTOR),
    ).resolves.toBeDefined();
  });

  it('add_item: preço vem do CATÁLOGO (basePriceCents × quantity), nunca de um valor mandado pelo cliente', async () => {
    const repo = makeRepo();
    const service = new OrderAdjustmentService(repo);

    const result = await service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, addItemInput({ quantity: 3 }), 'idem-1', ACTOR);

    // subtotal original 3200 + 800×3=2400 → 5600; total = 5600 + 490 (delivery fee)
    expect(result.currentSubtotalCents).toBe(5600);
    expect(result.currentTotalCents).toBe(6090);
    expect(repo.createOrderItem).toHaveBeenCalledWith(
      expect.objectContaining({ productId: PRODUCT_ID, unitBasePriceCents: 800, quantity: 3, lineTotalCents: 2400 }),
    );
    expect(repo.insertAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'add_item', quantityDelta: 3, subtotalDeltaCents: 2400, idempotencyKey: 'idem-1' }),
    );
  });

  it('add_item soma modifiers do catálogo (nunca preço do body)', async () => {
    const repo = makeRepo({
      findModifiers: vi
        .fn()
        .mockResolvedValue(new Map([[MODIFIER_ID, { id: MODIFIER_ID, name: 'Bacon', priceDeltaCents: 150 }]])),
    });
    const service = new OrderAdjustmentService(repo);

    const result = await service.applyAdjustment(
      TENANT_ID,
      STORE_ID,
      ORDER_ID,
      addItemInput({ quantity: 1, modifiers: [MODIFIER_ID] }),
      'idem-1',
      ACTOR,
    );

    // 3200 + (800+150)×1 = 4150
    expect(result.currentSubtotalCents).toBe(4150);
  });

  it('add_item com productId inexistente: CounterOrderProductNotFoundError', async () => {
    const repo = makeRepo({ findProducts: vi.fn().mockResolvedValue(new Map()) });
    const service = new OrderAdjustmentService(repo);

    await expect(
      service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, addItemInput(), 'idem-1', ACTOR),
    ).rejects.toThrow(CounterOrderProductNotFoundError);
    expect(repo.insertAdjustment).not.toHaveBeenCalled();
  });

  it('remove_item: delta negativo da quantidade/valor EFETIVOS do item (não a linha crua)', async () => {
    const repo = makeRepo({
      findOrderItemState: vi
        .fn()
        .mockResolvedValue({ id: ORDER_ITEM_ID, unitBasePriceCents: 800, effectiveQuantity: 2, effectiveLineTotalCents: 1600 }),
    });
    const service = new OrderAdjustmentService(repo);

    const result = await service.applyAdjustment(
      TENANT_ID,
      STORE_ID,
      ORDER_ID,
      { kind: 'remove_item', orderItemId: ORDER_ITEM_ID },
      'idem-1',
      ACTOR,
    );

    expect(result.currentSubtotalCents).toBe(1600); // 3200 - 1600
    expect(repo.insertAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'remove_item', orderItemId: ORDER_ITEM_ID, quantityDelta: -2, subtotalDeltaCents: -1600 }),
    );
    expect(repo.createOrderItem).not.toHaveBeenCalled();
  });

  it('remove_item num item já removido (quantidade efetiva zerada): OrderAdjustmentItemNotFoundError', async () => {
    const repo = makeRepo({
      findOrderItemState: vi
        .fn()
        .mockResolvedValue({ id: ORDER_ITEM_ID, unitBasePriceCents: 800, effectiveQuantity: 0, effectiveLineTotalCents: 0 }),
    });
    const service = new OrderAdjustmentService(repo);

    await expect(
      service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, { kind: 'remove_item', orderItemId: ORDER_ITEM_ID }, 'idem-1', ACTOR),
    ).rejects.toThrow(OrderAdjustmentItemNotFoundError);
  });

  it('remove_item com orderItemId inexistente (ou de outro pedido/tenant): OrderAdjustmentItemNotFoundError', async () => {
    const repo = makeRepo({ findOrderItemState: vi.fn().mockResolvedValue(null) });
    const service = new OrderAdjustmentService(repo);

    await expect(
      service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, { kind: 'remove_item', orderItemId: 'outro' }, 'idem-1', ACTOR),
    ).rejects.toThrow(OrderAdjustmentItemNotFoundError);
  });

  it('change_qty: recalcula do unitBasePriceCents IMUTÁVEL, delta contra o estado EFETIVO anterior', async () => {
    const repo = makeRepo({
      findOrderItemState: vi
        .fn()
        .mockResolvedValue({ id: ORDER_ITEM_ID, unitBasePriceCents: 800, effectiveQuantity: 2, effectiveLineTotalCents: 1600 }),
    });
    const service = new OrderAdjustmentService(repo);

    const result = await service.applyAdjustment(
      TENANT_ID,
      STORE_ID,
      ORDER_ID,
      { kind: 'change_qty', orderItemId: ORDER_ITEM_ID, newQuantity: 5 },
      'idem-1',
      ACTOR,
    );

    // novo lineTotal = 800×5=4000; delta = 4000-1600=2400; subtotal 3200+2400=5600
    expect(result.currentSubtotalCents).toBe(5600);
    expect(repo.insertAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'change_qty', quantityDelta: 3, subtotalDeltaCents: 2400 }),
    );
  });

  it('ajuste incremental: currentSubtotalCents anterior vira a BASE, não o subtotalCents original', async () => {
    const repo = makeRepo({
      findOrderForAdjustment: vi.fn().mockResolvedValue(order({ currentSubtotalCents: 5600, currentTotalCents: 6090 })),
      lockOrderForUpdate: vi.fn().mockResolvedValue(order({ currentSubtotalCents: 5600, currentTotalCents: 6090 })),
    });
    const service = new OrderAdjustmentService(repo);

    const result = await service.applyAdjustment(
      TENANT_ID,
      STORE_ID,
      ORDER_ID,
      { kind: 'remove_item', orderItemId: ORDER_ITEM_ID },
      'idem-1',
      ACTOR,
    );

    expect(result.currentSubtotalCents).toBe(4000); // 5600 - 1600
  });

  it('Idempotency-Key repetida: devolve o total ATUAL do pedido, não reaplica nada', async () => {
    const repo = makeRepo({
      hasIdempotencyKey: vi.fn().mockResolvedValue(true),
      findOrderForAdjustment: vi
        .fn()
        .mockResolvedValue(order({ currentSubtotalCents: 5600, currentTotalCents: 6090 })),
    });
    const service = new OrderAdjustmentService(repo);

    const result = await service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, addItemInput(), 'idem-repetida', ACTOR);

    expect(result).toEqual({ orderId: ORDER_ID, currentSubtotalCents: 5600, currentTotalCents: 6090 });
    expect(repo.lockOrderForUpdate).not.toHaveBeenCalled();
    expect(repo.createOrderItem).not.toHaveBeenCalled();
    expect(repo.insertAdjustment).not.toHaveBeenCalled();
  });

  it('grava audit_log só quando GANHA a corrida do ON CONFLICT (inserted=true)', async () => {
    const repo = makeRepo({ insertAdjustment: vi.fn().mockResolvedValue({ inserted: false }) });
    const service = new OrderAdjustmentService(repo);

    await service.applyAdjustment(TENANT_ID, STORE_ID, ORDER_ID, addItemInput(), 'idem-1', ACTOR);

    expect(repo.updateOrderCurrentTotals).not.toHaveBeenCalled();
    expect(repo.recordAuditLog).not.toHaveBeenCalled();
    expect(repo.findOrderForAdjustment).toHaveBeenCalledTimes(2); // 1 antes do lock, 1 pra reler após perder a corrida
  });
});
