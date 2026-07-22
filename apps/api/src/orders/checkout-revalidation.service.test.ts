import { describe, expect, it } from 'vitest';
import type { CheckoutRequest } from '@molho/contracts';
import type { DeliveryZoneMatch, DeliveryMatchRepository } from '../storefront/delivery-match.repository';
import type { Weekday } from '../storefront/store-hours';
import type { CheckoutProductRecord, CheckoutRepository, CheckoutStoreHoursRecord, CheckoutStoreRecord } from './checkout-revalidation.repository';
import { CheckoutRevalidationService } from './checkout-revalidation.service';

const WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const OPEN_ALL_WEEK: CheckoutStoreHoursRecord[] = WEEKDAYS.map((dayOfWeek) => ({
  dayOfWeek,
  opensAtMinutes: 0,
  closesAtMinutes: 1439,
}));
const FIXED_NOW = new Date('2026-07-22T15:00:00Z'); // 12h em America/Sao_Paulo

const PRODUCT: CheckoutProductRecord = {
  id: 'product-1',
  name: 'X-Burger',
  basePriceCents: 2890,
  available: true,
  modifiers: [{ id: 'mod-bacon', name: 'Bacon', priceDeltaCents: 500 }],
};

const ZONE_MATCH: DeliveryZoneMatch = { name: 'Centro', feeCents: 800, etaMinMinutes: 30, etaMaxMinutes: 50 };

class FakeCheckoutRepository implements CheckoutRepository {
  store: CheckoutStoreRecord | null = { minOrderCents: 3000, timezone: 'America/Sao_Paulo' };
  hours: CheckoutStoreHoursRecord[] = OPEN_ALL_WEEK;
  products: CheckoutProductRecord[] = [PRODUCT];

  async findStore() {
    return this.store;
  }
  async listStoreHours() {
    return this.hours;
  }
  async findProductsByIds(productIds: readonly string[]) {
    return this.products.filter((p) => productIds.includes(p.id));
  }
}

class FakeDeliveryMatchRepository implements DeliveryMatchRepository {
  zone: DeliveryZoneMatch | null = ZONE_MATCH;

  async findMatchingZone() {
    return this.zone;
  }
}

function baseRequest(overrides: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    items: [{ productId: 'product-1', unitBasePriceCents: 2890, modifiers: [{ modifierId: 'mod-bacon', priceDeltaCents: 500 }], quantity: 1, notes: null }],
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
    ...overrides,
  };
}

function setup() {
  const checkoutRepo = new FakeCheckoutRepository();
  const deliveryMatchRepo = new FakeDeliveryMatchRepository();
  const service = new CheckoutRevalidationService(checkoutRepo, deliveryMatchRepo, () => FIXED_NOW);
  return { checkoutRepo, deliveryMatchRepo, service };
}

describe('CheckoutRevalidationService.revalidate', () => {
  it('1) caminho feliz: dentro da zona, aberta, preço igual, acima do mínimo — canSubmit true, sem divergência', async () => {
    const { service } = setup();
    const result = await service.revalidate(baseRequest());

    expect(result.withinZone).toBe(true);
    expect(result.isOpenNow).toBe(true);
    expect(result.subtotalCents).toBe(3390); // 2890 + 500
    expect(result.deliveryFeeCents).toBe(800);
    expect(result.totalCents).toBe(4190);
    expect(result.hasUnfavorableDivergence).toBe(false);
    expect(result.canSubmit).toBe(true);
    expect(result.items[0]).toMatchObject({ available: true, priceChanged: false, lineTotalCents: 3390 });
  });

  it('2) fora da zona: fee/eta/total nulos, divergência desfavorável, canSubmit false', async () => {
    const { deliveryMatchRepo, service } = setup();
    deliveryMatchRepo.zone = null;

    const result = await service.revalidate(baseRequest());

    expect(result.withinZone).toBe(false);
    expect(result.deliveryFeeCents).toBeNull();
    expect(result.etaMinMinutes).toBeNull();
    expect(result.etaMaxMinutes).toBeNull();
    expect(result.totalCents).toBeNull();
    expect(result.hasUnfavorableDivergence).toBe(true);
    expect(result.canSubmit).toBe(false);
  });

  it('3) loja fechada: divergência desfavorável, canSubmit false', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.hours = [];

    const result = await service.revalidate(baseRequest());

    expect(result.isOpenNow).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
    expect(result.canSubmit).toBe(false);
  });

  it('4) produto ficou indisponível (esgotado): item sai com available false e lineTotalCents 0', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [{ ...PRODUCT, available: false }];

    const result = await service.revalidate(baseRequest());

    expect(result.items[0]).toMatchObject({ available: false, lineTotalCents: 0 });
    expect(result.subtotalCents).toBe(0);
    expect(result.hasUnfavorableDivergence).toBe(true);
    expect(result.canSubmit).toBe(false);
  });

  it('5) produto removido do catálogo: item vira indisponível com nome de fallback', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [];

    const result = await service.revalidate(baseRequest());

    expect(result.items[0]).toMatchObject({ available: false, name: '(produto removido do cardápio)' });
    expect(result.canSubmit).toBe(false);
  });

  it('6) modificador removido do produto: item vira indisponível', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [{ ...PRODUCT, modifiers: [] }];

    const result = await service.revalidate(baseRequest());

    expect(result.items[0]).toMatchObject({ available: false });
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('7) preço do produto subiu: priceChanged true e divergência desfavorável', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [{ ...PRODUCT, basePriceCents: 3500 }];

    const result = await service.revalidate(baseRequest());

    expect(result.items[0]).toMatchObject({ priceChanged: true });
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('8) preço do produto caiu: priceChanged true mas SEM divergência desfavorável (regra 14)', async () => {
    const { checkoutRepo, service } = setup();
    // 2600 + 500 (bacon) = 3100, ainda acima do minOrderCents (3000) do fixture — divergência de preço, não de mínimo.
    checkoutRepo.products = [{ ...PRODUCT, basePriceCents: 2600 }];

    const result = await service.revalidate(baseRequest());

    expect(result.items[0]).toMatchObject({ priceChanged: true });
    expect(result.hasUnfavorableDivergence).toBe(false);
    expect(result.canSubmit).toBe(true);
  });

  it('9) taxa de entrega subiu em relação à esperada: divergência desfavorável', async () => {
    const { deliveryMatchRepo, service } = setup();
    deliveryMatchRepo.zone = { ...ZONE_MATCH, feeCents: 1200 };

    const result = await service.revalidate(baseRequest());

    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('10) taxa de entrega caiu: sem divergência desfavorável', async () => {
    const { deliveryMatchRepo, service } = setup();
    deliveryMatchRepo.zone = { ...ZONE_MATCH, feeCents: 500 };

    const result = await service.revalidate(baseRequest());

    expect(result.hasUnfavorableDivergence).toBe(false);
  });

  it('11) expectedDeliveryFeeCents nulo: não compara taxa, não quebra', async () => {
    const { service } = setup();
    const request = baseRequest({ address: { ...baseRequest().address, expectedDeliveryFeeCents: null } });

    const result = await service.revalidate(request);

    expect(result.hasUnfavorableDivergence).toBe(false);
  });

  it('12) abaixo do pedido mínimo: divergência desfavorável, canSubmit false', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.store = { minOrderCents: 10000, timezone: 'America/Sao_Paulo' };

    const result = await service.revalidate(baseRequest());

    expect(result.hasUnfavorableDivergence).toBe(true);
    expect(result.canSubmit).toBe(false);
  });
});
