import { describe, expect, it, vi } from 'vitest';
import type { CheckoutRequest, RevalidatedCheckout } from '@molho/contracts';
import { CheckoutCustomerNotFoundError, CheckoutStoreNotConfiguredError } from './order-errors';
import type { CheckoutOrderRepository, CreateOrderParams } from './checkout-order.repository';
import { CheckoutOrderService } from './checkout-order.service';

const REQUEST: CheckoutRequest = {
  items: [{ productId: 'product-1', unitBasePriceCents: 2890, modifiers: [], quantity: 1, notes: null }],
  address: {
    label: 'Casa',
    street: 'Rua X',
    number: '10',
    complement: null,
    neighborhood: 'Centro',
    city: 'Estância Velha',
    state: 'RS',
    postalCode: null,
    referencePoint: null,
    lat: -29.6,
    lng: -51.17,
    expectedDeliveryFeeCents: 800,
  },
};

function happyRevalidation(overrides: Partial<RevalidatedCheckout> = {}): RevalidatedCheckout {
  return {
    items: [
      {
        productId: 'product-1',
        name: 'X-Burger',
        available: true,
        unitBasePriceCents: 2890,
        modifiers: [],
        quantity: 1,
        notes: null,
        lineTotalCents: 2890,
        priceChanged: false,
      },
    ],
    subtotalCents: 2890,
    withinZone: true,
    deliveryFeeCents: 800,
    etaMinMinutes: 30,
    etaMaxMinutes: 50,
    isOpenNow: true,
    nextOpensAt: null,
    minOrderCents: 1000,
    totalCents: 3690,
    hasUnfavorableDivergence: false,
    canSubmit: true,
    ...overrides,
  };
}

class FakeCheckoutOrderRepository implements CheckoutOrderRepository {
  customer: { id: string } | null = { id: 'customer-1' };
  storeId: string | null = 'store-1';
  createOrderCalls: CreateOrderParams[] = [];
  createOrderItemsCalls: unknown[] = [];

  async findCustomer() {
    return this.customer;
  }
  async findStoreId() {
    return this.storeId;
  }
  async createAddress() {
    return 'address-1';
  }
  async createOrder(params: CreateOrderParams) {
    this.createOrderCalls.push(params);
    return 'order-1';
  }
  async createOrderItems(orderId: string, items: unknown) {
    this.createOrderItemsCalls.push({ orderId, items });
  }
}

function setup() {
  const repo = new FakeCheckoutOrderRepository();
  const revalidationService = { revalidate: vi.fn().mockResolvedValue(happyRevalidation()) };
  const orderStatusService = { recordCreation: vi.fn().mockResolvedValue(undefined) };
  const service = new CheckoutOrderService(repo, revalidationService as never, orderStatusService as never);
  return { repo, revalidationService, orderStatusService, service };
}

describe('CheckoutOrderService.createOrder', () => {
  it('1) customer não encontrado no tenant: lança CheckoutCustomerNotFoundError sem revalidar', async () => {
    const { repo, revalidationService, service } = setup();
    repo.customer = null;

    await expect(service.createOrder('tenant-1', 'customer-x', REQUEST)).rejects.toThrow(CheckoutCustomerNotFoundError);
    expect(revalidationService.revalidate).not.toHaveBeenCalled();
  });

  it('2) loja não configurada: lança CheckoutStoreNotConfiguredError', async () => {
    const { repo, service } = setup();
    repo.storeId = null;

    await expect(service.createOrder('tenant-1', 'customer-1', REQUEST)).rejects.toThrow(CheckoutStoreNotConfiguredError);
  });

  it('3) canSubmit false: devolve ok:false com a revalidação, não cria nada', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate.mockResolvedValue(happyRevalidation({ canSubmit: false, withinZone: false }));

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST);

    expect(result.ok).toBe(false);
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('4) canSubmit true mas hasUnfavorableDivergence true (preço subiu): ainda assim ok:false', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate.mockResolvedValue(happyRevalidation({ hasUnfavorableDivergence: true }));

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST);

    expect(result.ok).toBe(false);
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('5) caminho feliz: cria endereço, pedido, itens e grava order_status_history', async () => {
    const { repo, orderStatusService, service } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST);

    expect(result).toMatchObject({
      ok: true,
      response: { orderId: 'order-1', status: 'received', paymentStatus: 'aguardando_confirmacao', totalCents: 3690 },
    });
    expect(repo.createOrderCalls[0]).toMatchObject({ storeId: 'store-1', customerId: 'customer-1', deliveryAddressId: 'address-1' });
    expect(repo.createOrderItemsCalls[0]).toMatchObject({ orderId: 'order-1' });
    expect(orderStatusService.recordCreation).toHaveBeenCalledWith({
      orderId: 'order-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
    });
  });
});
