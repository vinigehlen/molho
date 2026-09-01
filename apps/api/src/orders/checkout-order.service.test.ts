import { describe, expect, it, vi } from 'vitest';
import type { ResolvedAddress } from '../geo/resolve-address';
import type { CheckoutRequest, RevalidatedCheckout } from '@molho/contracts';
import {
  CheckoutCustomerNotFoundError,
  CheckoutOtpRequiredError,
  CheckoutStoreNotConfiguredError,
  GuestCustomerNotAllowedError,
  GuestCustomerRequiredError,
  InvalidChangeAmountError,
  PaymentMethodNotAvailableError,
} from './order-errors';
import type { CheckoutOrderRepository, CreateOrderParams, DeliveryAddressSnapshot, StoreForOrder } from './checkout-order.repository';
import { CheckoutOrderService } from './checkout-order.service';
import type { PaymentMethodModuleGate } from './payment-method-module-gate';
import type { CheckoutGuestGate } from '../modules/checkout-guest.gate';

const ITEMS = [{ productId: 'product-1', unitBasePriceCents: 2890, modifiers: [], quantity: 1, notes: null }];
const ADDRESS = {
  label: 'Casa',
  street: 'Rua X',
  number: '10',
  complement: null,
  neighborhood: 'Centro',
  city: 'Estância Velha',
  state: 'RS',
  postalCode: '93610-000',
  referencePoint: null,
  expectedDeliveryFeeCents: 800,
};

/** O que o middleware de geocode resolveu — nunca vem do cliente. */
const RESOLVED: ResolvedAddress = {
  street: 'Avenida Brasil',
  neighborhood: 'Rincão',
  city: 'Estância Velha',
  state: 'RS',
  lat: -29.6,
  lng: -51.17,
  postalCodeVerified: true,
};

const REQUEST: CheckoutRequest = { items: ITEMS, fulfillmentType: 'delivery', address: ADDRESS, paymentMethod: 'pix' };
const REQUEST_CASH: CheckoutRequest = {
  items: ITEMS,
  fulfillmentType: 'delivery',
  address: ADDRESS,
  paymentMethod: 'cash_on_delivery',
  changeForCents: 5000,
};
const REQUEST_CARD: CheckoutRequest = { items: ITEMS, fulfillmentType: 'delivery', address: ADDRESS, paymentMethod: 'card_on_delivery' };

function happyRevalidation(overrides: Partial<RevalidatedCheckout> = {}): RevalidatedCheckout {
  return {
    items: [
      {
        productId: 'product-1',
        offerId: null,
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
    couponCode: null,
    couponValid: false,
    discountCents: 0,
    scheduledFor: null,
    scheduledForValid: false,
    totalCents: 3690,
    hasUnfavorableDivergence: false,
    canSubmit: true,
    ...overrides,
  };
}

class FakeCheckoutOrderRepository implements CheckoutOrderRepository {
  customer: { id: string; phoneVerifiedAt: Date | null } | null = { id: 'customer-1', phoneVerifiedAt: new Date() };
  store: StoreForOrder | null = {
    id: 'store-1',
    pixKey: 'loja@exemplo.com',
    pixKeyType: 'email',
    pixMerchantCity: 'Sao Paulo',
    name: 'Loja Teste',
    timezone: 'America/Sao_Paulo',
  };
  createOrderCalls: CreateOrderParams[] = [];
  createOrderItemsCalls: unknown[] = [];
  lockProductsForUpdateCalls: string[][] = [];
  lockOffersForUpdateCalls: Array<ReadonlyArray<{ productId: string; offerId?: string }>> = [];

  async findCustomer() {
    return this.customer;
  }
  async findStore() {
    return this.store;
  }
  async lockProductsForUpdate(productIds: readonly string[]) {
    this.lockProductsForUpdateCalls.push([...productIds]);
  }
  async lockOffersForUpdate(items: readonly { productId: string; offerId?: string }[]) {
    this.lockOffersForUpdateCalls.push(items.map((item) => ({ ...item })));
  }
  comboChildProductIds: string[] = [];
  lockComboItemsForUpdateCalls: string[][] = [];
  async lockComboItemsForUpdate(comboProductIds: readonly string[]) {
    this.lockComboItemsForUpdateCalls.push([...comboProductIds]);
    return this.comboChildProductIds;
  }
  claimCouponResult: { couponId: string; couponCodeSnapshot: string } | null = { couponId: 'coupon-1', couponCodeSnapshot: 'PROMO10' };
  claimCouponCalls: string[] = [];
  async claimCoupon(code: string) {
    this.claimCouponCalls.push(code);
    return this.claimCouponResult;
  }
  claimSchedulingSlotResult = true;
  claimSchedulingSlotCalls: { storeId: string; timezone: string; scheduledFor: Date }[] = [];
  async claimSchedulingSlot(storeId: string, timezone: string, scheduledFor: Date) {
    this.claimSchedulingSlotCalls.push({ storeId, timezone, scheduledFor });
    return this.claimSchedulingSlotResult;
  }
  createAddressCalls: DeliveryAddressSnapshot[] = [];
  async createAddress(_customerId: string, address: DeliveryAddressSnapshot) {
    this.createAddressCalls.push(address);
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

/** `checkout.guest` — desligado por padrão, como todo tenant sem linha em tenant_settings. */
class FakeCheckoutGuestGate implements CheckoutGuestGate {
  active = false;
  async isActive() {
    return this.active;
  }
}

/** Espelha o contrato de `CustomerIdentityRepository.findOrCreate` só no que o service usa. */
class FakeCustomerIdentityRepository {
  calls: { tenantId: string; phone: string; options: { name?: string; verified: boolean } }[] = [];

  async findOrCreate(tenantId: string, phone: { e164?: string } | unknown, options: { name?: string; verified: boolean }) {
    this.calls.push({ tenantId, phone: String((phone as { toString(): string }).toString()), options });
    return { identity: { id: 'customer-guest-1', name: options.name ?? 'Cliente' }, created: true };
  }
}

function setup() {
  const repo = new FakeCheckoutOrderRepository();
  const revalidationService = { revalidate: vi.fn().mockResolvedValue(happyRevalidation()) };
  const orderStatusService = { recordCreation: vi.fn().mockResolvedValue(undefined) };
  const moduleGate = new FakeModuleGate();
  const guestGate = new FakeCheckoutGuestGate();
  const customerIdentity = new FakeCustomerIdentityRepository();
  const now = new Date('2026-08-14T18:00:00.000Z');
  const service = new CheckoutOrderService(
    repo,
    revalidationService as never,
    orderStatusService as never,
    moduleGate,
    guestGate,
    customerIdentity as never,
    () => now,
  );
  return { repo, revalidationService, orderStatusService, moduleGate, guestGate, customerIdentity, service };
}

describe('CheckoutOrderService.createOrder', () => {
  it('1) customer não encontrado no tenant: lança CheckoutCustomerNotFoundError sem revalidar', async () => {
    const { repo, revalidationService, service } = setup();
    repo.customer = null;

    await expect(service.createOrder('tenant-1', 'customer-x', REQUEST, RESOLVED)).rejects.toThrow(CheckoutCustomerNotFoundError);
    expect(revalidationService.revalidate).not.toHaveBeenCalled();
  });

  it('2) loja não configurada: lança CheckoutStoreNotConfiguredError', async () => {
    const { repo, service } = setup();
    repo.store = null;

    await expect(service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED)).rejects.toThrow(CheckoutStoreNotConfiguredError);
  });

  it('2b) loja existe mas sem chave PIX configurada: lança CheckoutStoreNotConfiguredError (mesma natureza — não está pronta pra vender)', async () => {
    const { repo, service } = setup();
    repo.store = { ...repo.store!, pixKey: null };

    await expect(service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED)).rejects.toThrow(CheckoutStoreNotConfiguredError);
  });

  it('3) canSubmit false: devolve ok:false com a revalidação, não cria nada', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate.mockResolvedValue(happyRevalidation({ canSubmit: false, withinZone: false }));

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED);

    expect(result.ok).toBe(false);
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('4) canSubmit true mas hasUnfavorableDivergence true (preço subiu): ainda assim ok:false', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate.mockResolvedValue(happyRevalidation({ hasUnfavorableDivergence: true }));

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED);

    expect(result.ok).toBe(false);
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('6) trava produto, composição de combo e oferta ANTES de revalidar — fecha corrida em dinheiro/disponibilidade', async () => {
    const { repo, revalidationService, service } = setup();
    const ordem: string[] = [];
    repo.lockProductsForUpdate = async (productIds: readonly string[]) => {
      ordem.push(`lock-product:${productIds.join(',') || 'empty'}`);
      repo.lockProductsForUpdateCalls.push([...productIds]);
    };
    repo.lockComboItemsForUpdate = async (comboProductIds: readonly string[]) => {
      ordem.push('lock-combo-items');
      repo.lockComboItemsForUpdateCalls.push([...comboProductIds]);
      return repo.comboChildProductIds;
    };
    repo.lockOffersForUpdate = async (items) => {
      ordem.push('lock-offer');
      repo.lockOffersForUpdateCalls.push(items.map((item) => ({ ...item })));
    };
    revalidationService.revalidate.mockImplementation(async () => {
      ordem.push('revalidate');
      return happyRevalidation();
    });

    const requestComItemRepetido: CheckoutRequest = {
      ...REQUEST,
      items: [...REQUEST.items, { ...REQUEST.items[0]!, notes: 'outra linha, mesmo produto' }],
    };

    await service.createOrder('tenant-1', 'customer-1', requestComItemRepetido, RESOLVED);

    expect(ordem).toEqual(['lock-product:product-1', 'lock-combo-items', 'lock-offer', 'revalidate']);
    expect(repo.lockProductsForUpdateCalls[0]).toEqual(['product-1']); // dedup — 2 linhas, 1 produto só
    expect(repo.lockOffersForUpdateCalls[0]).toHaveLength(2);
  });

  it('4b) combo (fase 4.1b): trava também os produtos-filho e as ofertas deles antes de revalidar', async () => {
    const { repo, service } = setup();
    repo.comboChildProductIds = ['child-a', 'child-b'];

    await service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED);

    expect(repo.lockProductsForUpdateCalls[0]).toEqual(['product-1']);
    expect(repo.lockComboItemsForUpdateCalls[0]).toEqual(['product-1']);
    expect(repo.lockProductsForUpdateCalls[1]).toEqual(['child-a', 'child-b']);
    // 1 item do request + as ofertas principais dos 2 filhos
    const lockedOffers = repo.lockOffersForUpdateCalls[0]!;
    expect(lockedOffers).toHaveLength(3);
    expect(lockedOffers).toContainEqual({ productId: 'child-a' });
    expect(lockedOffers).toContainEqual({ productId: 'child-b' });
  });

  it('5) caminho feliz (pix): cria endereço, pedido, itens, grava order_status_history e devolve o QR', async () => {
    const { repo, orderStatusService, service } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED);

    expect(result).toMatchObject({
      ok: true,
      response: {
        orderId: 'order-1',
        status: 'received',
        paymentStatus: 'aguardando_confirmacao',
        totalCents: 3690,
        paymentMethod: 'pix',
        fulfillmentType: 'delivery',
        fulfillmentDeadlineAt: '2026-08-14T18:50:00.000Z',
      },
    });
    expect(repo.createOrderCalls[0]?.fulfillmentDeadlineAt.toISOString()).toBe('2026-08-14T18:50:00.000Z');
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

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST_CASH, RESOLVED);

    expect(result).toMatchObject({
      ok: true,
      response: { paymentMethod: 'cash_on_delivery', changeForCents: 5000 },
    });
    if (result.ok) expect('pix' in result.response).toBe(false);
    expect(repo.createOrderCalls[0]).toMatchObject({ paymentMethod: 'cash_on_delivery', changeForCents: 5000 });
  });

  it('8) caminho feliz (card_on_delivery): sem pix, sem changeForCents', async () => {
    const { repo, service } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST_CARD, RESOLVED);

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

    await expect(service.createOrder('tenant-1', 'customer-1', pedirTrocoDeMenos, RESOLVED)).rejects.toThrow(InvalidChangeAmountError);
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('10) cash_on_delivery com changeForCents null (não precisa de troco): aceita normal', async () => {
    const { repo, service } = setup();
    const semTroco: CheckoutRequest = { ...REQUEST_CASH, changeForCents: null };

    const result = await service.createOrder('tenant-1', 'customer-1', semTroco, RESOLVED);

    expect(result).toMatchObject({ ok: true, response: { changeForCents: null } });
    expect(repo.createOrderCalls[0]).toMatchObject({ changeForCents: null });
  });

  it('11) módulo do método de pagamento desligado: PaymentMethodNotAvailableError, ANTES de travar produto/revalidar', async () => {
    const { repo, revalidationService, moduleGate, service } = setup();
    moduleGate.active = false;

    await expect(service.createOrder('tenant-1', 'customer-1', REQUEST_CASH, RESOLVED)).rejects.toThrow(PaymentMethodNotAvailableError);
    expect(moduleGate.calls).toEqual(['cash_on_delivery']);
    expect(revalidationService.revalidate).not.toHaveBeenCalled();
    expect(repo.lockProductsForUpdateCalls).toHaveLength(0);
  });
});

/**
 * O flag `postalCodeVerified` distingue os dois subcasos em que o pedido
 * PASSA sem ponto exato — a diferença importa porque num deles a CIDADE que
 * decidiu a taxa não veio de fonte autoritativa.
 */
describe('CheckoutOrderService — CEP verificado vs. não verificado (Épico 6, Bloco 2)', () => {
  it('ViaCEP autoritativo sem ponto: grava verified=true e geo nulo', async () => {
    const { repo, service } = setup();
    const semPonto: ResolvedAddress = { ...RESOLVED, lat: null, lng: null, postalCodeVerified: true };

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST, semPonto);

    expect(result).toMatchObject({ ok: true });
    // Endereço e snapshot do pedido saem do MESMO objeto — não podem divergir.
    expect(repo.createAddressCalls[0]).toMatchObject({ lat: null, lng: null, postalCodeVerified: true });
    expect(repo.createOrderCalls[0]?.address).toBe(repo.createAddressCalls[0]);
    // A rua veio do ViaCEP, não do texto que o cliente digitou.
    expect(repo.createOrderCalls[0]?.address?.street).toBe('Avenida Brasil');
  });

  it('ViaCEP mudo: cidade vem do texto do cliente e o pedido nasce verified=false', async () => {
    const { repo, service } = setup();
    // Nada de autoritativo: o middleware caiu inteiro no fallback de texto.
    const doTexto: ResolvedAddress = {
      street: ADDRESS.street,
      neighborhood: ADDRESS.neighborhood,
      city: ADDRESS.city,
      state: ADDRESS.state,
      lat: null,
      lng: null,
      postalCodeVerified: false,
    };

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST, doTexto);

    expect(result).toMatchObject({ ok: true });
    // Passa — a taxa é conhecida —, mas marcado: o lojista confere antes de
    // despachar, porque quem afirmou a cidade foi o cliente.
    expect(repo.createOrderCalls[0]?.address).toMatchObject({
      city: 'Estância Velha',
      postalCodeVerified: false,
    });
  });
});

/**
 * Checkout sem OTP (Épico 9c) — CLAUDE.md regra 13, EMENDA.
 *
 * O guard já garantiu que token PRESENTE e inválido virou 401 antes de chegar
 * aqui: pro service, `null` significa "request anônima", nunca "token que
 * falhou". Por isso os casos abaixo são sobre POLÍTICA (módulo ligado?
 * identidade declarada?), não sobre validação de token.
 */
describe('CheckoutOrderService.createOrder — checkout guest', () => {
  const GUEST = { name: 'Ana Souza', phone: '51999990000' };

  it('anônimo com o módulo DESLIGADO: exige OTP e não cria nada', async () => {
    const { service, revalidationService, repo } = setup();

    await expect(service.createOrder('tenant-1', null, REQUEST, RESOLVED, GUEST)).rejects.toThrow(CheckoutOtpRequiredError);
    expect(revalidationService.revalidate).not.toHaveBeenCalled();
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('anônimo com o módulo LIGADO mas sem nome/telefone: 400, comanda anônima não passa', async () => {
    const { service, guestGate, repo } = setup();
    guestGate.active = true;

    await expect(service.createOrder('tenant-1', null, REQUEST, RESOLVED, null)).rejects.toThrow(GuestCustomerRequiredError);
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('TOKEN presente + bloco customer no body: 400, nunca ignora o bloco', async () => {
    const { service, repo, revalidationService } = setup();

    await expect(service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED, GUEST)).rejects.toThrow(
      GuestCustomerNotAllowedError,
    );
    // Nada foi lido nem escrito: a rejeição vem antes de tudo, senão o cliente
    // logado teria carimbado o pedido no telefone que digitou.
    expect(revalidationService.revalidate).not.toHaveBeenCalled();
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('TOKEN presente + bloco customer: rejeita MESMO com o módulo guest ligado', async () => {
    const { service, guestGate, repo } = setup();
    guestGate.active = true;

    await expect(service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED, GUEST)).rejects.toThrow(
      GuestCustomerNotAllowedError,
    );
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('guest completo: cria o pedido com customer_verified FALSE e sem carimbar verificação', async () => {
    const { service, guestGate, customerIdentity, repo } = setup();
    guestGate.active = true;

    const result = await service.createOrder('tenant-1', null, REQUEST, RESOLVED, GUEST);

    expect(result.ok).toBe(true);
    expect(customerIdentity.calls).toHaveLength(1);
    expect(customerIdentity.calls[0]?.options).toEqual({ name: 'Ana Souza', verified: false });
    expect(repo.createOrderCalls[0]?.customerVerified).toBe(false);
    expect(repo.createOrderCalls[0]?.customerId).toBe('customer-guest-1');
  });

  it('guest com telefone impossível (DDD inexistente): rejeita antes de criar cliente ou pedido', async () => {
    const { service, guestGate, customerIdentity, repo } = setup();
    guestGate.active = true;

    await expect(
      service.createOrder('tenant-1', null, REQUEST, RESOLVED, { name: 'Ana', phone: '11111111111' }),
    ).rejects.toThrow();
    expect(customerIdentity.calls).toHaveLength(0);
    expect(repo.createOrderCalls).toHaveLength(0);
  });

  it('autenticado: customer_verified sai da LINHA, não da presença do token', async () => {
    const { service, repo } = setup();
    // Cliente que pediu como guest antes e nunca verificou, agora com token
    // (cenário do módulo indo e voltando). O pedido tem que registrar a
    // verdade da linha.
    repo.customer = { id: 'customer-1', phoneVerifiedAt: null };

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED);

    expect(result.ok).toBe(true);
    expect(repo.createOrderCalls[0]?.customerVerified).toBe(false);
  });

  it('autenticado e verificado: customer_verified TRUE (caminho normal de hoje)', async () => {
    const { service, repo } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED);

    expect(result.ok).toBe(true);
    expect(repo.createOrderCalls[0]?.customerVerified).toBe(true);
  });
});

/** `resolved: null` ⟺ `request.fulfillmentType === 'pickup'` (invariante do controller). */
describe('CheckoutOrderService.createOrder — retirada no balcão', () => {
  const REQUEST_PICKUP: CheckoutRequest = { items: ITEMS, fulfillmentType: 'pickup', address: null, paymentMethod: 'pix' };

  it('pickup: não cria linha em addresses, deliveryAddressId e address nulos no pedido', async () => {
    const { repo, service } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST_PICKUP, null);

    expect(result.ok).toBe(true);
    expect(repo.createAddressCalls).toHaveLength(0);
    expect(repo.createOrderCalls[0]).toMatchObject({ fulfillmentType: 'pickup', deliveryAddressId: null, address: null });
    expect(repo.createOrderCalls[0]?.createdAt.toISOString()).toBe('2026-08-14T18:00:00.000Z');
    expect(repo.createOrderCalls[0]?.fulfillmentDeadlineAt.toISOString()).toBe('2026-08-14T18:30:00.000Z');
    if (result.ok) {
      expect(result.response.fulfillmentDeadlineAt).toBe('2026-08-14T18:30:00.000Z');
      expect(result.response.fulfillmentType).toBe('pickup');
    }
  });
});

/** Épico conversão (C2) — docs/handoff-features-conversao-gestor.md A2. */
describe('CheckoutOrderService.createOrder — cupom de desconto', () => {
  it('1) cupom válido: claimCoupon é chamado, desconto/cupom entram no pedido e na resposta', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate.mockResolvedValue(
      happyRevalidation({ couponCode: 'PROMO10', couponValid: true, discountCents: 339, totalCents: 3851 }),
    );

    const result = await service.createOrder('tenant-1', 'customer-1', { ...REQUEST, couponCode: 'PROMO10' }, RESOLVED);

    expect(repo.claimCouponCalls).toEqual(['PROMO10']);
    expect(repo.createOrderCalls[0]).toMatchObject({ couponId: 'coupon-1', couponCodeSnapshot: 'PROMO10', discountCents: 339 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.discountCents).toBe(339);
      expect(result.response.couponCode).toBe('PROMO10');
      expect(result.response.totalCents).toBe(3851);
    }
  });

  it('2) sem couponCode: NUNCA chama claimCoupon, pedido nasce sem desconto', async () => {
    const { repo, service } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED);

    expect(repo.claimCouponCalls).toHaveLength(0);
    expect(repo.createOrderCalls[0]).toMatchObject({ couponId: null, couponCodeSnapshot: null, discountCents: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.discountCents).toBe(0);
      expect(result.response.couponCode).toBeNull();
    }
  });

  it('3) couponValid false na revalidação (já reprovado lá): NUNCA chama claimCoupon — hasUnfavorableDivergence já barrou antes', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate.mockResolvedValue(
      happyRevalidation({ couponCode: 'ESGOTADO', couponValid: false, hasUnfavorableDivergence: true }),
    );

    const result = await service.createOrder('tenant-1', 'customer-1', { ...REQUEST, couponCode: 'ESGOTADO' }, RESOLVED);

    expect(result.ok).toBe(false);
    expect(repo.claimCouponCalls).toHaveLength(0);
  });

  it('4) claimCoupon perde a corrida (outro pedido esgotou nos milissegundos entre revalidar e criar): revalida de novo, ok:false, NUNCA cria o pedido fingindo desconto', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate
      .mockResolvedValueOnce(happyRevalidation({ couponCode: 'PROMO10', couponValid: true, discountCents: 339, totalCents: 3851 }))
      .mockResolvedValueOnce(happyRevalidation({ couponCode: 'PROMO10', couponValid: false, hasUnfavorableDivergence: true }));
    repo.claimCouponResult = null;

    const result = await service.createOrder('tenant-1', 'customer-1', { ...REQUEST, couponCode: 'PROMO10' }, RESOLVED);

    expect(repo.claimCouponCalls).toEqual(['PROMO10']);
    expect(revalidationService.revalidate).toHaveBeenCalledTimes(2);
    expect(repo.createOrderCalls).toHaveLength(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.revalidation.couponValid).toBe(false);
    }
  });
});

/** Épico conversão (C3) — docs/handoff-features-conversao-gestor.md A3. */
describe('CheckoutOrderService.createOrder — agendamento de pedido', () => {
  const SCHEDULED_FOR = '2026-08-15T21:00:00.000Z';

  it('1) scheduledFor válido: claimSchedulingSlot é chamado, horário entra no pedido e na resposta', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate.mockResolvedValue(
      happyRevalidation({ scheduledFor: SCHEDULED_FOR, scheduledForValid: true }),
    );

    const result = await service.createOrder('tenant-1', 'customer-1', { ...REQUEST, scheduledFor: SCHEDULED_FOR }, RESOLVED);

    expect(repo.claimSchedulingSlotCalls).toEqual([
      { storeId: 'store-1', timezone: 'America/Sao_Paulo', scheduledFor: new Date(SCHEDULED_FOR) },
    ]);
    expect(repo.createOrderCalls[0]?.scheduledFor).toEqual(new Date(SCHEDULED_FOR));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.scheduledFor).toBe(SCHEDULED_FOR);
    }
  });

  it('2) sem scheduledFor: NUNCA chama claimSchedulingSlot, pedido nasce "o quanto antes"', async () => {
    const { repo, service } = setup();

    const result = await service.createOrder('tenant-1', 'customer-1', REQUEST, RESOLVED);

    expect(repo.claimSchedulingSlotCalls).toHaveLength(0);
    expect(repo.createOrderCalls[0]?.scheduledFor).toBeNull();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.scheduledFor).toBeNull();
    }
  });

  it('3) scheduledForValid false na revalidação: NUNCA chama claimSchedulingSlot — hasUnfavorableDivergence já barrou antes', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate.mockResolvedValue(
      happyRevalidation({ scheduledFor: SCHEDULED_FOR, scheduledForValid: false, hasUnfavorableDivergence: true }),
    );

    const result = await service.createOrder('tenant-1', 'customer-1', { ...REQUEST, scheduledFor: SCHEDULED_FOR }, RESOLVED);

    expect(result.ok).toBe(false);
    expect(repo.claimSchedulingSlotCalls).toHaveLength(0);
  });

  it('4) claimSchedulingSlot perde a corrida (slot lotou entre revalidar e criar): revalida de novo, ok:false, NUNCA cria o pedido fingindo vaga', async () => {
    const { repo, revalidationService, service } = setup();
    revalidationService.revalidate
      .mockResolvedValueOnce(happyRevalidation({ scheduledFor: SCHEDULED_FOR, scheduledForValid: true }))
      .mockResolvedValueOnce(happyRevalidation({ scheduledFor: SCHEDULED_FOR, scheduledForValid: false, hasUnfavorableDivergence: true }));
    repo.claimSchedulingSlotResult = false;

    const result = await service.createOrder('tenant-1', 'customer-1', { ...REQUEST, scheduledFor: SCHEDULED_FOR }, RESOLVED);

    expect(repo.claimSchedulingSlotCalls).toHaveLength(1);
    expect(revalidationService.revalidate).toHaveBeenCalledTimes(2);
    expect(repo.createOrderCalls).toHaveLength(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.revalidation.scheduledForValid).toBe(false);
    }
  });
});
