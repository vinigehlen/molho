import { describe, expect, it, vi } from 'vitest';
import type { CheckoutRequest, RevalidatedCheckout } from '@molho/contracts';
import {
  CheckoutCustomerNotFoundError,
  CheckoutStoreNotConfiguredError,
  InvalidChangeAmountError,
  PaymentMethodNotAvailableError,
} from './order-errors';
import type { CheckoutOrderRepository, CreateOrderParams, StoreForOrder } from './checkout-order.repository';
import { CheckoutOrderService } from './checkout-order.service';
import type { PaymentMethodModuleGate } from './payment-method-module-gate';

const ITEMS = [{ productId: 'product-1', unitBasePriceCents: 2890, modifiers: [], quantity: 1, notes: null }];
const ADDRESS = {
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
};

const REQUEST: CheckoutRequest = { items: ITEMS, address: ADDRESS, paymentMethod: 'pix' };
const REQUEST_CASH: CheckoutRequest = { items: ITEMS, address: ADDRESS, paymentMethod: 'cash_on_delivery', changeForCents: 5000 };
const REQUEST_CARD: CheckoutRequest = { items: ITEMS, address: ADDRESS, paymentMethod: 'card_on_delivery' };

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
  store: StoreForOrder | null = {
    id: 'store-1',
    pixKey: 'loja@exemplo.com',
    pixKeyType: 'email',
    pixMerchantCity: 'Sao Paulo',
    name: 'Loja Teste',
  };
  createOrderCalls: CreateOrderParams[] = [];
  createOrderItemsCalls: unknown[] = [];
  lockProductsForUpdateCalls: string[][] = [];

  async findCustomer() {
    return this.customer;
  }
  async findStore() {
    return this.store;
  }
  async lockProductsForUpdate(productIds: readonly string[]) {
    this.lockProductsForUpdateCalls.push([...productIds]);
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

class FakeModuleGate implements PaymentMethodModuleGate {
  active = true;
  calls: string[] = [];

  async assertAvailable(_tenantId: string, paymentMethod: string) {
    this.calls.push(paymentMethod);
    if (!this.active) throw new PaymentMethodNotAvailableError(paymentMethod);
  }
}

function setup() {
  const repo = new FakeCheckoutOrderRepository();
  const revalidationService = { revalidate: vi.fn().mockResolvedValue(happyRevalidation()) };
  const orderStatusService = { recordCreation: vi.fn().mockResolvedValue(undefined) };
  const moduleGate = new FakeModuleGate();
  const service = new CheckoutOrderService(repo, revalidationService as never, orderStatusService as never, moduleGate);
  return { repo, revalidationService, orderStatusService, moduleGate, service };
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
    repo.store = null;

    await expect(service.createOrder('tenant-1', 'customer-1', REQUEST)).rejects.toThrow(CheckoutStoreNotConfiguredError);
  });

  it('2b) loja existe mas sem chave PIX configurada: lança CheckoutStoreNotConfiguredError (mesma natureza — não está pronta pra vender)', async () => {
    const { repo, service } = setup();
    repo.store = { ...repo.store!, pixKey: null };

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

  it('6) trava as linhas de produto (ids únicos) ANTES de revalidar — fecha a janela de corrida em preço/disponibilidade', async () => {
    const { repo, revalidationService, service } = setup();
    const ordem: string[] = [];
    repo.lockProductsForUpdate = async (productIds: readonly string[]) => {
      ordem.push('lock');
      repo.lockProductsForUpdateCalls.push([...productIds]);
    };
    revalidationService.revalidate.mockImplementation(async () => {
      ordem.push('revalidate');
      return happyRevalidation();
    });

    const requestComItemRepetido: CheckoutRequest = {
      ...REQUEST,
      items: [...REQUEST.items, { ...REQUEST.items[0]!, notes: 'outra linha, mesmo produto' }],
    };

    await service.createOrder('tenant-1', 'customer-1', requestComItemRepetido);

    expect(ordem).toEqual(['lock', 'revalidate']);
    expect(repo.lockProductsForUpdateCalls[0]).toEqual(['product-1']); // dedup — 2 linhas, 1 produto só
  });

  it('5) caminho feliz (pix): cria endereço, pedido, itens, grava order_status_history e devolve o QR', async () => {
    const { repo, orderStatusService, service } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST);

    expect(result).toMatchObject({
      ok: true,
      response: { orderId: 'order-1', status: 'received', paymentStatus: 'aguardando_confirmacao', totalCents: 3690, paymentMethod: 'pix' },
    });
    if (result.ok && result.response.paymentMethod === 'pix') {
      expect(result.response.pix).toMatchObject({ key: 'loja@exemplo.com', keyType: 'email' });
      expect(result.response.pix.payload).toContain('540536.90'); // campo 54 (valor): TLV "54" + length "05" + "36.90"
    }
    expect(repo.createOrderCalls[0]).toMatchObject({
      storeId: 'store-1',
      customerId: 'customer-1',
      deliveryAddressId: 'address-1',
      paymentMethod: 'pix',
      changeForCents: null,
    });
    expect(repo.createOrderItemsCalls[0]).toMatchObject({ orderId: 'order-1' });
    expect(orderStatusService.recordCreation).toHaveBeenCalledWith({
      orderId: 'order-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
    });
  });

  it('7) caminho feliz (cash_on_delivery): devolve changeForCents, nunca pix', async () => {
    const { repo, service } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST_CASH);

    expect(result).toMatchObject({
      ok: true,
      response: { paymentMethod: 'cash_on_delivery', changeForCents: 5000 },
    });
    if (result.ok) expect('pix' in result.response).toBe(false);
    expect(repo.createOrderCalls[0]).toMatchObject({ paymentMethod: 'cash_on_delivery', changeForCents: 5000 });
  });

  it('8) caminho feliz (card_on_delivery): sem pix, sem changeForCents', async () => {
    const { repo, service } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST_CARD);

    expect(result).toMatchObject({ ok: true, response: { paymentMethod: 'card_on_delivery' } });
    if (result.ok) {
      expect('pix' in result.response).toBe(false);
      expect('changeForCents' in result.response).toBe(false);
    }
    expect(repo.createOrderCalls[0]).toMatchObject({ paymentMethod: 'card_on_delivery', changeForCents: null });
  });

  it('9) cash_on_delivery com changeForCents menor que o total: InvalidChangeAmountError, não cria pedido', async () => {
    const { repo, service } = setup();
    const pedirTrocoDeMenos: CheckoutRequest = { ...REQUEST_CASH, changeForCents: 1000 }; // total é 3690

    await expect(service.createOrder('tenant-1', 'customer-1', pedirTrocoDeMenos)).rejects.toThrow(InvalidChangeAmountError);
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('10) cash_on_delivery com changeForCents null (não precisa de troco): aceita normal', async () => {
    const { repo, service } = setup();
    const semTroco: CheckoutRequest = { ...REQUEST_CASH, changeForCents: null };

    const result = await service.createOrder('tenant-1', 'customer-1', semTroco);

    expect(result).toMatchObject({ ok: true, response: { changeForCents: null } });
    expect(repo.createOrderCalls[0]).toMatchObject({ changeForCents: null });
  });

  it('11) módulo do método de pagamento desligado: PaymentMethodNotAvailableError, ANTES de travar produto/revalidar', async () => {
    const { repo, revalidationService, moduleGate, service } = setup();
    moduleGate.active = false;

    await expect(service.createOrder('tenant-1', 'customer-1', REQUEST_CASH)).rejects.toThrow(PaymentMethodNotAvailableError);
    expect(moduleGate.calls).toEqual(['cash_on_delivery']);
    expect(revalidationService.revalidate).not.toHaveBeenCalled();
    expect(repo.lockProductsForUpdateCalls).toHaveLength(0);
  });
});
