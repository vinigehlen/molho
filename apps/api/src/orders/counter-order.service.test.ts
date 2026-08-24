import type { CounterOrderInput } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  CounterOrderProductNotFoundError,
  CounterOrderStoreNotFoundError,
  MissingIdempotencyKeyError,
  WeighedPriceOutOfRangeError,
} from './counter-order.errors';
import type { CounterOrderRepository } from './counter-order.repository';
import { CounterOrderService, WEIGHED_LINE_MAX_CENTS } from './counter-order.service';
import type { OrderStatusRepository } from './order-status.repository';

const STORE_ID = 'store-1';
const TENANT_ID = 'tenant-1';
const PRODUCT_ID = 'product-1';
const MODIFIER_ID = 'modifier-1';
const ACTOR = { id: 'staff-1', role: 'cashier' };

function makeRepo(overrides: Partial<CounterOrderRepository> = {}): CounterOrderRepository {
  return {
    findStore: vi.fn().mockResolvedValue({ id: STORE_ID }),
    findProducts: vi.fn().mockResolvedValue(new Map([[PRODUCT_ID, { id: PRODUCT_ID, name: 'Coxinha', basePriceCents: 800 }]])),
    findModifiers: vi.fn().mockResolvedValue(new Map()),
    findOrderByIdempotencyKey: vi.fn().mockResolvedValue(null),
    createAnonymousCustomer: vi.fn().mockResolvedValue('customer-1'),
    createOrder: vi.fn().mockResolvedValue({ id: 'order-1', created: true }),
    createOrderItems: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeOrderStatusRepo(): OrderStatusRepository {
  return {
    findForTransition: vi.fn(),
    wasIdempotencyKeyApplied: vi.fn(),
    applyStatusChange: vi.fn(),
    recordHistory: vi.fn().mockResolvedValue(undefined),
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
  };
}

function unitInput(overrides: Partial<Extract<CounterOrderInput['items'][number], { kind: 'unit' }>> = {}) {
  return { kind: 'unit' as const, productId: PRODUCT_ID, quantity: 2, ...overrides };
}

describe('CounterOrderService.createOrder', () => {
  it('sem Idempotency-Key: MissingIdempotencyKeyError, nunca toca no banco', async () => {
    const repo = makeRepo();
    const service = new CounterOrderService(repo, makeOrderStatusRepo());
    const input: CounterOrderInput = { items: [unitInput()], paymentMethod: 'pix' };

    await expect(service.createOrder(TENANT_ID, STORE_ID, input, undefined, ACTOR)).rejects.toThrow(
      MissingIdempotencyKeyError,
    );
    expect(repo.findStore).not.toHaveBeenCalled();
  });

  it('loja inexistente/de outro tenant: CounterOrderStoreNotFoundError', async () => {
    const repo = makeRepo({ findStore: vi.fn().mockResolvedValue(null) });
    const service = new CounterOrderService(repo, makeOrderStatusRepo());
    const input: CounterOrderInput = { items: [unitInput()], paymentMethod: 'pix' };

    await expect(service.createOrder(TENANT_ID, STORE_ID, input, 'idem-1', ACTOR)).rejects.toThrow(
      CounterOrderStoreNotFoundError,
    );
  });

  it('item unit: preço vem do CATÁLOGO (basePriceCents × quantity), nunca de um valor mandado pelo cliente', async () => {
    const repo = makeRepo();
    const service = new CounterOrderService(repo, makeOrderStatusRepo());
    // Nenhum campo de preço existe no tipo CounterUnitItemInput — a prova É a
    // ausência estrutural (ver counter-order.test.ts, contracts). Aqui prova-se
    // que o VALOR gravado é 800×2=1600, batendo com basePriceCents do fake repo,
    // não com nada que o teste tenha "mandado".
    const input: CounterOrderInput = { items: [unitInput({ quantity: 2 })], paymentMethod: 'pix' };

    const result = await service.createOrder(TENANT_ID, STORE_ID, input, 'idem-1', ACTOR);

    expect(result.subtotalCents).toBe(1600);
    expect(result.totalCents).toBe(1600);
    expect(repo.createOrderItems).toHaveBeenCalledWith(
      'order-1',
      expect.arrayContaining([expect.objectContaining({ unitBasePriceCents: 800, quantity: 2, lineTotalCents: 1600 })]),
    );
  });

  it('item unit soma modifiers do catálogo (nunca preço do body)', async () => {
    const repo = makeRepo({
      findModifiers: vi
        .fn()
        .mockResolvedValue(new Map([[MODIFIER_ID, { id: MODIFIER_ID, name: 'Bacon', priceDeltaCents: 150 }]])),
    });
    const service = new CounterOrderService(repo, makeOrderStatusRepo());
    const input: CounterOrderInput = {
      items: [unitInput({ quantity: 1, modifiers: [MODIFIER_ID] })],
      paymentMethod: 'pix',
    };

    const result = await service.createOrder(TENANT_ID, STORE_ID, input, 'idem-1', ACTOR);

    expect(result.subtotalCents).toBe(950); // 800 + 150
  });

  it('productId inexistente: CounterOrderProductNotFoundError', async () => {
    const repo = makeRepo({ findProducts: vi.fn().mockResolvedValue(new Map()) });
    const service = new CounterOrderService(repo, makeOrderStatusRepo());
    const input: CounterOrderInput = { items: [unitInput()], paymentMethod: 'pix' };

    await expect(service.createOrder(TENANT_ID, STORE_ID, input, 'idem-1', ACTOR)).rejects.toThrow(
      CounterOrderProductNotFoundError,
    );
  });

  it('item weighed: usa lineTotalCents como veio (POS trust)', async () => {
    const repo = makeRepo();
    const service = new CounterOrderService(repo, makeOrderStatusRepo());
    const input: CounterOrderInput = {
      items: [{ kind: 'weighed', productId: PRODUCT_ID, weightGrams: 350, lineTotalCents: 4200 }],
      paymentMethod: 'cash_at_counter',
    };

    const result = await service.createOrder(TENANT_ID, STORE_ID, input, 'idem-1', ACTOR);

    expect(result.subtotalCents).toBe(4200);
  });

  it('item weighed acima do teto: WeighedPriceOutOfRangeError', async () => {
    const repo = makeRepo();
    const service = new CounterOrderService(repo, makeOrderStatusRepo());
    const input: CounterOrderInput = {
      items: [{ kind: 'weighed', productId: PRODUCT_ID, weightGrams: 350, lineTotalCents: WEIGHED_LINE_MAX_CENTS + 1 }],
      paymentMethod: 'pix',
    };

    await expect(service.createOrder(TENANT_ID, STORE_ID, input, 'idem-1', ACTOR)).rejects.toThrow(
      WeighedPriceOutOfRangeError,
    );
    expect(repo.createOrder).not.toHaveBeenCalled();
  });

  it('Idempotency-Key repetida: devolve o pedido existente, não cria de novo', async () => {
    const repo = makeRepo({
      findOrderByIdempotencyKey: vi
        .fn()
        .mockResolvedValue({ id: 'order-1', status: 'received', paymentMethod: 'pix', subtotalCents: 1600, totalCents: 1600 }),
    });
    const service = new CounterOrderService(repo, makeOrderStatusRepo());
    const input: CounterOrderInput = { items: [unitInput()], paymentMethod: 'pix' };

    const result = await service.createOrder(TENANT_ID, STORE_ID, input, 'idem-repetida', ACTOR);

    expect(result).toEqual({
      orderId: 'order-1',
      status: 'received',
      paymentStatus: 'confirmado',
      paymentMethod: 'pix',
      subtotalCents: 1600,
      totalCents: 1600,
    });
    expect(repo.createAnonymousCustomer).not.toHaveBeenCalled();
    expect(repo.createOrder).not.toHaveBeenCalled();
  });

  it('pedido novo nasce received para aparecer no gestor, mas pagamento ja confirmado', async () => {
    const orderStatusRepo = makeOrderStatusRepo();
    const repo = makeRepo();
    const service = new CounterOrderService(repo, orderStatusRepo);
    const input: CounterOrderInput = { items: [unitInput()], paymentMethod: 'pix' };

    const result = await service.createOrder(TENANT_ID, STORE_ID, input, 'idem-1', ACTOR);

    expect(result.status).toBe('received');
    expect(result.paymentStatus).toBe('confirmado');
    expect(orderStatusRepo.recordHistory).toHaveBeenCalledWith(expect.objectContaining({ toStatus: 'received' }));
    expect(orderStatusRepo.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ toStatus: 'received' }));
  });

  it('grava history/audit_log só quando GANHA a corrida do ON CONFLICT (created=true)', async () => {
    const orderStatusRepo = makeOrderStatusRepo();
    const repo = makeRepo({ createOrder: vi.fn().mockResolvedValue({ id: 'order-2', created: false }) });
    const service = new CounterOrderService(repo, orderStatusRepo);
    const input: CounterOrderInput = { items: [unitInput()], paymentMethod: 'pix' };

    await service.createOrder(TENANT_ID, STORE_ID, input, 'idem-1', ACTOR);

    expect(repo.createOrderItems).not.toHaveBeenCalled();
    expect(orderStatusRepo.recordHistory).not.toHaveBeenCalled();
    expect(orderStatusRepo.recordAuditLog).not.toHaveBeenCalled();
  });

  it('customerName informado vira nome do customer; ausente vira "Balcão"', async () => {
    const repo = makeRepo();
    const service = new CounterOrderService(repo, makeOrderStatusRepo());
    await service.createOrder(TENANT_ID, STORE_ID, { items: [unitInput()], paymentMethod: 'pix' }, 'idem-1', ACTOR);
    expect(repo.createAnonymousCustomer).toHaveBeenCalledWith('Balcão');

    const repo2 = makeRepo();
    const service2 = new CounterOrderService(repo2, makeOrderStatusRepo());
    await service2.createOrder(
      TENANT_ID,
      STORE_ID,
      { items: [unitInput()], paymentMethod: 'pix', customerName: 'Zé' },
      'idem-2',
      ACTOR,
    );
    expect(repo2.createAnonymousCustomer).toHaveBeenCalledWith('Zé');
  });
});
