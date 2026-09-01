import { describe, expect, it } from 'vitest';
import type { ResolvedAddress } from '../geo/resolve-address';
import type { CheckoutRequest } from '@molho/contracts';
import type { DeliveryLocation, DeliveryZoneMatch, DeliveryMatchRepository } from '../storefront/delivery-match.repository';
import type { Weekday } from '../storefront/store-hours';
import type {
  CheckoutCouponRecord,
  CheckoutOfferRecord,
  CheckoutRepository,
  CheckoutSchedulingSlotRecord,
  CheckoutStoreHoursRecord,
  CheckoutStoreRecord,
} from './checkout-revalidation.repository';
import { CheckoutRevalidationService } from './checkout-revalidation.service';

const WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const OPEN_ALL_WEEK: CheckoutStoreHoursRecord[] = WEEKDAYS.map((dayOfWeek) => ({
  dayOfWeek,
  opensAtMinutes: 0,
  closesAtMinutes: 1439,
}));
const FIXED_NOW = new Date('2026-07-22T15:00:00Z'); // 12h em America/Sao_Paulo

const PRODUCT: CheckoutOfferRecord = {
  id: 'offer-1',
  productId: 'product-1',
  isPrimary: true,
  name: 'X-Burger',
  basePriceCents: 2890,
  available: true,
  comboPricingMode: 'fixed',
  productKind: 'prepared',
  modifiers: [{ id: 'mod-bacon', name: 'Bacon', priceDeltaCents: 500 }],
  comboComponents: [],
};

const SECONDARY_OFFER: CheckoutOfferRecord = {
  ...PRODUCT,
  id: 'offer-2',
  isPrimary: false,
  basePriceCents: 2390,
};

const ZONE_MATCH: DeliveryZoneMatch = { name: 'Centro', feeCents: 800, etaMinMinutes: 30, etaMaxMinutes: 50 };

class FakeCheckoutRepository implements CheckoutRepository {
  store: CheckoutStoreRecord | null = { minOrderCents: 3000, timezone: 'America/Sao_Paulo' };
  hours: CheckoutStoreHoursRecord[] = OPEN_ALL_WEEK;
  products: CheckoutOfferRecord[] = [PRODUCT];

  async findStore() {
    return this.store;
  }
  async listStoreHours() {
    return this.hours;
  }
  async findOffersForItems(items: readonly { productId: string; offerId?: string }[]) {
    return this.products.filter((offer) =>
      items.some((item) =>
        item.offerId ? item.offerId === offer.id : item.productId === offer.productId && offer.isPrimary,
      ),
    );
  }
  coupon: CheckoutCouponRecord | null = null;
  async findCoupon(_code: string) {
    return this.coupon;
  }
  slots: CheckoutSchedulingSlotRecord[] = [];
  async listSchedulingSlots() {
    return this.slots;
  }
  scheduledCounts: number[] = [];
  scheduledCountResult = 0;
  async countScheduledOrders(start: Date, end: Date) {
    this.scheduledCounts.push(start.getTime(), end.getTime());
    return this.scheduledCountResult;
  }
}

class FakeDeliveryMatchRepository implements DeliveryMatchRepository {
  zone: DeliveryZoneMatch | null = ZONE_MATCH;
  ultimaConsulta: DeliveryLocation | null = null;

  async findMatchingZone(location: DeliveryLocation) {
    this.ultimaConsulta = location;
    return this.zone;
  }
}

/**
 * revalidate() nunca lê `paymentMethod` (só `items`/`address`) — sempre 'pix'
 * aqui só pra satisfazer o tipo (união discriminada, Épico 8). Overrides
 * tipado só com os campos comuns a todo branch (`Pick`, não `Partial<CheckoutRequest>`
 * inteiro — `Partial` de uma union discriminada perde o discriminante).
 */
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

function baseRequest(
  overrides: Partial<Pick<CheckoutRequest, 'items' | 'address' | 'fulfillmentType' | 'couponCode' | 'scheduledFor'>> = {},
): CheckoutRequest {
  return {
    items: [{ productId: 'product-1', unitBasePriceCents: 2890, modifiers: [{ modifierId: 'mod-bacon', priceDeltaCents: 500 }], quantity: 1, notes: null }],
    fulfillmentType: 'delivery',
    address: {
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
    },
    paymentMethod: 'pix',
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
    const result = await service.revalidate(baseRequest(), RESOLVED);

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

    const result = await service.revalidate(baseRequest(), RESOLVED);

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

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.isOpenNow).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
    expect(result.canSubmit).toBe(false);
  });

  it('4) produto ficou indisponível (esgotado): item sai com available false e lineTotalCents 0', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [{ ...PRODUCT, available: false }];

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.items[0]).toMatchObject({ available: false, lineTotalCents: 0 });
    expect(result.subtotalCents).toBe(0);
    expect(result.hasUnfavorableDivergence).toBe(true);
    expect(result.canSubmit).toBe(false);
  });

  it('5) produto removido do catálogo: item vira indisponível com nome de fallback', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [];

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.items[0]).toMatchObject({ available: false, name: '(produto removido do cardápio)' });
    expect(result.canSubmit).toBe(false);
  });

  it('6) modificador removido do produto: item vira indisponível', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [{ ...PRODUCT, modifiers: [] }];

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.items[0]).toMatchObject({ available: false });
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('7) preço do produto subiu: priceChanged true e divergência desfavorável', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [{ ...PRODUCT, basePriceCents: 3500 }];

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.items[0]).toMatchObject({ priceChanged: true });
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('8) preço do produto caiu: priceChanged true mas SEM divergência desfavorável (regra 14)', async () => {
    const { checkoutRepo, service } = setup();
    // 2600 + 500 (bacon) = 3100, ainda acima do minOrderCents (3000) do fixture — divergência de preço, não de mínimo.
    checkoutRepo.products = [{ ...PRODUCT, basePriceCents: 2600 }];

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.items[0]).toMatchObject({ priceChanged: true });
    expect(result.hasUnfavorableDivergence).toBe(false);
    expect(result.canSubmit).toBe(true);
  });

  it('8.1) precifica pela oferta secundária escolhida, não pela principal', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [PRODUCT, SECONDARY_OFFER];
    checkoutRepo.store = { minOrderCents: 0, timezone: 'America/Sao_Paulo' };

    const result = await service.revalidate(
      baseRequest({
        items: [
          {
            ...baseRequest().items[0]!,
            offerId: 'offer-2',
            unitBasePriceCents: 2390,
          },
        ],
      }),
      RESOLVED,
    );

    expect(result.items[0]).toMatchObject({
      productId: 'product-1',
      offerId: 'offer-2',
      unitBasePriceCents: 2390,
      lineTotalCents: 2890,
      priceChanged: false,
    });
  });

  it('8.2) cliente antigo sem offerId continua usando a oferta principal', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.products = [PRODUCT, SECONDARY_OFFER];

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.items[0]).toMatchObject({ offerId: 'offer-1', unitBasePriceCents: 2890 });
  });

  it('8.3) rejeita oferta de outro produto mesmo quando o id da oferta existe', async () => {
    const { service } = setup();
    const result = await service.revalidate(
      baseRequest({
        items: [{ ...baseRequest().items[0]!, productId: 'product-2', offerId: 'offer-1' }],
      }),
      RESOLVED,
    );

    expect(result.items[0]).toMatchObject({ available: false, lineTotalCents: 0 });
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('9) taxa de entrega subiu em relação à esperada: divergência desfavorável', async () => {
    const { deliveryMatchRepo, service } = setup();
    deliveryMatchRepo.zone = { ...ZONE_MATCH, feeCents: 1200 };

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('10) taxa de entrega caiu: sem divergência desfavorável', async () => {
    const { deliveryMatchRepo, service } = setup();
    deliveryMatchRepo.zone = { ...ZONE_MATCH, feeCents: 500 };

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.hasUnfavorableDivergence).toBe(false);
  });

  it('11) expectedDeliveryFeeCents nulo: não compara taxa, não quebra', async () => {
    const { service } = setup();
    // Non-null: baseRequest() por padrão é sempre `delivery` com endereço cheio.
    const request = baseRequest({ address: { ...baseRequest().address!, expectedDeliveryFeeCents: null } });

    const result = await service.revalidate(request, RESOLVED);

    expect(result.hasUnfavorableDivergence).toBe(false);
  });

  it('12) abaixo do pedido mínimo: divergência desfavorável, canSubmit false', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.store = { minOrderCents: 10000, timezone: 'America/Sao_Paulo' };

    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.hasUnfavorableDivergence).toBe(true);
    expect(result.canSubmit).toBe(false);
  });
});

/**
 * Os TRÊS desfechos do Bloco 2, que não podem ser conflados (o 422 de
 * endereço irresolúvel nasce no middleware, nunca aqui — ver
 * geocode.middleware.test.ts):
 *
 *   422             → nem a cidade se sabe
 *   200 withinZone:false → cidade conhecida, não atendida
 *   200 withinZone:true  → cidade atendida, com ou sem ponto
 */
describe('CheckoutRevalidationService — desfechos por cidade (Épico 6, Bloco 2)', () => {
  it('cidade atendida SEM ponto nenhum: passa, com taxa — o ponto não decide preço', async () => {
    const { deliveryMatchRepo, service } = setup();
    const semPonto: ResolvedAddress = { ...RESOLVED, lat: null, lng: null };

    const result = await service.revalidate(baseRequest(), semPonto);

    expect(deliveryMatchRepo.ultimaConsulta).toEqual({ city: 'Estância Velha', state: 'RS', lat: null, lng: null });
    expect(result.withinZone).toBe(true);
    expect(result.deliveryFeeCents).toBe(800);
    expect(result.canSubmit).toBe(true);
  });

  it('cidade NÃO atendida: 200 gracioso com withinZone false, nunca exceção', async () => {
    const { deliveryMatchRepo, service } = setup();
    deliveryMatchRepo.zone = null;

    const result = await service.revalidate(baseRequest(), { ...RESOLVED, city: 'Canoas' });

    expect(result.withinZone).toBe(false);
    expect(result.canSubmit).toBe(false);
    // "Não entregamos aí" é resposta de negócio: o cliente vê o motivo e
    // pode trocar de endereço, em vez de levar um erro na cara.
    expect(result.items).toHaveLength(1);
  });

  it('a CIDADE consultada é a resolvida pelo servidor, não a que o cliente digitou', async () => {
    const { deliveryMatchRepo, service } = setup();
    const request = baseRequest();
    // Non-null: baseRequest() por padrão é sempre `delivery` com endereço cheio.
    request.address!.city = 'Cidade Inventada';
    request.address!.state = 'SP';

    await service.revalidate(request, RESOLVED);

    expect(deliveryMatchRepo.ultimaConsulta).toMatchObject({ city: 'Estância Velha', state: 'RS' });
  });

  it('nunca geocoda: qualquer fetch a partir daqui é erro de arquitetura', async () => {
    // O geocode roda em MIDDLEWARE, fora da transação de request — HTTP
    // externo aqui dentro seguraria uma conexão do pool o request todo
    // (CLAUDE.md § Contexto de request). O lint proíbe o import; este teste
    // pega qualquer caminho que escape dele.
    const { service } = setup();
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('CheckoutRevalidationService NUNCA pode fazer HTTP — geocode é no middleware.');
    }) as typeof fetch;

    try {
      await expect(service.revalidate(baseRequest(), RESOLVED)).resolves.toMatchObject({ withinZone: true });
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});

/** `resolved: null` ⟺ pickup (invariante do controller) — nunca consulta zona. */
describe('CheckoutRevalidationService — retirada no balcão', () => {
  it('pickup: sempre withinZone true, taxa 0, sem ETA, nunca consulta zona', async () => {
    const { deliveryMatchRepo, service } = setup();
    const request = baseRequest({ fulfillmentType: 'pickup', address: null });

    const result = await service.revalidate(request, null);

    expect(deliveryMatchRepo.ultimaConsulta).toBeNull();
    expect(result.withinZone).toBe(true);
    expect(result.deliveryFeeCents).toBe(0);
    expect(result.etaMinMinutes).toBeNull();
    expect(result.etaMaxMinutes).toBeNull();
    expect(result.totalCents).toBe(3390); // só o subtotal, sem taxa
    expect(result.canSubmit).toBe(true);
  });

  it('pickup: loja fechada ainda bloqueia canSubmit (retirada não pula horário)', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.hours = [];

    const result = await service.revalidate(baseRequest({ fulfillmentType: 'pickup', address: null }), null);

    expect(result.isOpenNow).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
    expect(result.canSubmit).toBe(false);
  });
});

/** Épico conversão (C2) — docs/handoff-features-conversao-gestor.md A2. */
describe('CheckoutRevalidationService — cupom de desconto', () => {
  const PERCENT_COUPON: CheckoutCouponRecord = {
    discountType: 'percent',
    discountPercent: 10,
    discountValueCents: null,
    minOrderCents: 0,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-12-31T23:59:59Z'),
    maxUses: 100,
    usesCount: 0,
    active: true,
  };

  it('1) sem couponCode: sem cupom, sem divergência — não é "perdeu algo", é "nunca pediu nada"', async () => {
    const { service } = setup();
    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.couponCode).toBeNull();
    expect(result.couponValid).toBe(false);
    expect(result.discountCents).toBe(0);
    expect(result.hasUnfavorableDivergence).toBe(false);
  });

  it('2) cupom percent válido: desconta do SUBTOTAL, nunca da taxa', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.coupon = PERCENT_COUPON;

    const result = await service.revalidate(baseRequest({ couponCode: 'PROMO10' }), RESOLVED);

    expect(result.couponValid).toBe(true);
    expect(result.discountCents).toBe(339); // 10% de 3390
    expect(result.totalCents).toBe(3390 + 800 - 339);
    expect(result.hasUnfavorableDivergence).toBe(false);
  });

  it('3) cupom fixed válido', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.coupon = { ...PERCENT_COUPON, discountType: 'fixed', discountPercent: null, discountValueCents: 500 };

    const result = await service.revalidate(baseRequest({ couponCode: 'PROMO500' }), RESOLVED);

    expect(result.discountCents).toBe(500);
    expect(result.totalCents).toBe(3390 + 800 - 500);
  });

  it('4) desconto fixed nunca excede o subtotal — nunca total negativo', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.coupon = { ...PERCENT_COUPON, discountType: 'fixed', discountPercent: null, discountValueCents: 999_999 };

    const result = await service.revalidate(baseRequest({ couponCode: 'PROMOGIGANTE' }), RESOLVED);

    expect(result.discountCents).toBe(3390); // capado no subtotal
    expect(result.totalCents).toBe(800); // só a taxa sobra
  });

  it('5) cupom não encontrado: couponValid false, divergência desfavorável (código digitado não é confiável até o servidor confirmar)', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.coupon = null;

    const result = await service.revalidate(baseRequest({ couponCode: 'NAOEXISTE' }), RESOLVED);

    expect(result.couponValid).toBe(false);
    expect(result.discountCents).toBe(0);
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('6) cupom inativo: couponValid false, divergência', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.coupon = { ...PERCENT_COUPON, active: false };

    const result = await service.revalidate(baseRequest({ couponCode: 'PROMO10' }), RESOLVED);

    expect(result.couponValid).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('7) cupom fora da validade (expirado): couponValid false, divergência', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.coupon = { ...PERCENT_COUPON, endsAt: new Date('2026-01-31T23:59:59Z') };

    const result = await service.revalidate(baseRequest({ couponCode: 'PROMO10' }), RESOLVED);

    expect(result.couponValid).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('8) subtotal abaixo do mínimo do cupom: couponValid false, divergência', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.coupon = { ...PERCENT_COUPON, minOrderCents: 10_000 };

    const result = await service.revalidate(baseRequest({ couponCode: 'PROMO10' }), RESOLVED);

    expect(result.couponValid).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('9) cupom esgotado (usesCount >= maxUses): couponValid false, divergência', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.coupon = { ...PERCENT_COUPON, usesCount: 100, maxUses: 100 };

    const result = await service.revalidate(baseRequest({ couponCode: 'PROMO10' }), RESOLVED);

    expect(result.couponValid).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
  });
});

/** Épico conversão (C3) — docs/handoff-features-conversao-gestor.md A3. FIXED_NOW é quarta 12h em São Paulo. */
describe('CheckoutRevalidationService — agendamento de pedido', () => {
  // Quarta 18h-20h em São Paulo — 2026-07-22 é quarta, GMT-3.
  const SLOT: CheckoutSchedulingSlotRecord = {
    dayOfWeek: 'wednesday',
    startsAtMinutes: 18 * 60,
    endsAtMinutes: 20 * 60,
    maxOrders: 5,
  };
  const WITHIN_SLOT_UTC = '2026-07-22T21:00:00.000Z'; // 18h em São Paulo, dentro do slot.

  it('1) sem scheduledFor: "o quanto antes", sem divergência', async () => {
    const { service } = setup();
    const result = await service.revalidate(baseRequest(), RESOLVED);

    expect(result.scheduledFor).toBeNull();
    expect(result.scheduledForValid).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(false);
  });

  it('2) scheduledFor futuro, dentro de um slot com vaga: válido, sem divergência', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.slots = [SLOT];
    checkoutRepo.scheduledCountResult = 2; // 2 de 5 vagas usadas

    const result = await service.revalidate(baseRequest({ scheduledFor: WITHIN_SLOT_UTC }), RESOLVED);

    expect(result.scheduledForValid).toBe(true);
    expect(result.hasUnfavorableDivergence).toBe(false);
  });

  it('3) scheduledFor no PASSADO: inválido, divergência', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.slots = [SLOT];

    const result = await service.revalidate(baseRequest({ scheduledFor: '2026-07-20T12:00:00.000Z' }), RESOLVED);

    expect(result.scheduledForValid).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('4) scheduledFor fora de qualquer slot definido: inválido, divergência', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.slots = [SLOT];
    // 10h em São Paulo (13h UTC), fora do slot 18h-20h.
    const result = await service.revalidate(baseRequest({ scheduledFor: '2026-07-22T13:00:00.000Z' }), RESOLVED);

    expect(result.scheduledForValid).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('5) slot lotado (contagem >= maxOrders): inválido, divergência — mesma categoria de item indisponível', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.slots = [SLOT];
    checkoutRepo.scheduledCountResult = 5; // maxOrders atingido

    const result = await service.revalidate(baseRequest({ scheduledFor: WITHIN_SLOT_UTC }), RESOLVED);

    expect(result.scheduledForValid).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('6) loja fechada no horário pedido (fora de qualquer turno): inválido mesmo caindo num slot cadastrado', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.hours = []; // nenhum turno cadastrado — loja nunca abre
    checkoutRepo.slots = [SLOT];

    const result = await service.revalidate(baseRequest({ scheduledFor: WITHIN_SLOT_UTC }), RESOLVED);

    expect(result.scheduledForValid).toBe(false);
    expect(result.hasUnfavorableDivergence).toBe(true);
  });

  it('7) scheduledFor não consulta contagem quando nem cai em slot nenhum (economiza round-trip)', async () => {
    const { checkoutRepo, service } = setup();
    checkoutRepo.slots = [SLOT];

    await service.revalidate(baseRequest({ scheduledFor: '2026-07-22T13:00:00.000Z' }), RESOLVED);

    expect(checkoutRepo.scheduledCounts).toHaveLength(0);
  });

  describe('combo (fase 4.1b)', () => {
    const COMBO: CheckoutOfferRecord = {
      id: 'offer-combo',
      productId: 'product-combo',
      isPrimary: true,
      name: 'Combo Casal',
      basePriceCents: 5990,
      available: true,
      comboPricingMode: 'fixed',
      productKind: 'combo',
      modifiers: [],
      comboComponents: [
        { childProductId: 'child-xis', name: 'Xis', quantity: 2, removable: false, unitBasePriceCents: 2490, available: true },
        { childProductId: 'child-refri', name: 'Refri', quantity: 2, removable: true, unitBasePriceCents: 500, available: true },
      ],
    };
    const comboRequest = () =>
      baseRequest({
        items: [{ productId: 'product-combo', unitBasePriceCents: 5990, modifiers: [], quantity: 1, notes: null }],
      });

    it('todos os filhos disponíveis: item disponível, preço fixo da oferta, comboComponents no snapshot', async () => {
      const { checkoutRepo, service } = setup();
      checkoutRepo.products = [COMBO];

      const result = await service.revalidate(comboRequest(), RESOLVED);

      expect(result.items[0]).toMatchObject({
        available: true,
        lineTotalCents: 5990,
        priceChanged: false,
        comboComponents: [
          { childProductId: 'child-xis', name: 'Xis', quantity: 2 },
          { childProductId: 'child-refri', name: 'Refri', quantity: 2, removable: true, removed: false },
        ],
      });
      expect(result.canSubmit).toBe(true);
    });

    it('um filho esgotado: combo inteiro indisponível, divergência desfavorável, sem comboComponents', async () => {
      const { checkoutRepo, service } = setup();
      checkoutRepo.products = [
        { ...COMBO, comboComponents: [{ ...COMBO.comboComponents[0]!, available: false }, COMBO.comboComponents[1]!] },
      ];

      const result = await service.revalidate(comboRequest(), RESOLVED);

      expect(result.items[0]).toMatchObject({ available: false, lineTotalCents: 0 });
      expect(result.items[0]!.comboComponents).toBeUndefined();
      expect(result.hasUnfavorableDivergence).toBe(true);
      expect(result.canSubmit).toBe(false);
    });

    it('combo sem nenhum filho vivo: indisponível', async () => {
      const { checkoutRepo, service } = setup();
      checkoutRepo.products = [{ ...COMBO, comboComponents: [] }];

      const result = await service.revalidate(comboRequest(), RESOLVED);

      expect(result.items[0]).toMatchObject({ available: false });
      expect(result.canSubmit).toBe(false);
    });

    it('sum_of_items usa a soma das ofertas principais dos filhos como preço base', async () => {
      const { checkoutRepo, service } = setup();
      checkoutRepo.products = [{ ...COMBO, comboPricingMode: 'sum_of_items' }];

      const result = await service.revalidate(comboRequest(), RESOLVED);

      expect(result.items[0]).toMatchObject({
        available: true,
        unitBasePriceCents: 5980,
        lineTotalCents: 5980,
        priceChanged: true,
        comboComponents: [
          { childProductId: 'child-xis', quantity: 2, unitBasePriceCents: 2490 },
          { childProductId: 'child-refri', quantity: 2, unitBasePriceCents: 500 },
        ],
      });
      expect(result.hasUnfavorableDivergence).toBe(false);
      expect(result.canSubmit).toBe(true);
    });

    it('sum_of_items marca divergência desfavorável quando a soma atual ficou maior', async () => {
      const { checkoutRepo, service } = setup();
      checkoutRepo.products = [
        {
          ...COMBO,
          comboPricingMode: 'sum_of_items',
          comboComponents: [
            { ...COMBO.comboComponents[0]!, unitBasePriceCents: 2890 },
            COMBO.comboComponents[1]!,
          ],
        },
      ];

      const result = await service.revalidate(comboRequest(), RESOLVED);

      expect(result.items[0]).toMatchObject({
        unitBasePriceCents: 6780,
        lineTotalCents: 6780,
        priceChanged: true,
      });
      expect(result.hasUnfavorableDivergence).toBe(true);
    });

    it('fixed: remoção permitida marca componente removido sem abater preço', async () => {
      const { checkoutRepo, service } = setup();
      checkoutRepo.products = [COMBO];

      const result = await service.revalidate(
        baseRequest({
          items: [
            {
              productId: 'product-combo',
              removedChildIds: ['child-refri'],
              unitBasePriceCents: 5990,
              modifiers: [],
              quantity: 1,
              notes: null,
            },
          ],
        }),
        RESOLVED,
      );

      expect(result.items[0]).toMatchObject({
        available: true,
        unitBasePriceCents: 5990,
        lineTotalCents: 5990,
        priceChanged: false,
        comboComponents: [
          { childProductId: 'child-xis', removed: false },
          { childProductId: 'child-refri', removed: true },
        ],
      });
      expect(result.hasUnfavorableDivergence).toBe(false);
    });

    it('sum_of_items: remoção permitida abate o preço do filho removido', async () => {
      const { checkoutRepo, service } = setup();
      checkoutRepo.products = [{ ...COMBO, comboPricingMode: 'sum_of_items' }];

      const result = await service.revalidate(
        baseRequest({
          items: [
            {
              productId: 'product-combo',
              removedChildIds: ['child-refri'],
              unitBasePriceCents: 4980,
              modifiers: [],
              quantity: 1,
              notes: null,
            },
          ],
        }),
        RESOLVED,
      );

      expect(result.items[0]).toMatchObject({
        available: true,
        unitBasePriceCents: 4980,
        lineTotalCents: 4980,
        priceChanged: false,
        comboComponents: [
          { childProductId: 'child-xis', removed: false, unitBasePriceCents: 2490 },
          { childProductId: 'child-refri', removed: true, unitBasePriceCents: 500 },
        ],
      });
      expect(result.hasUnfavorableDivergence).toBe(false);
    });

    it('remoção pedida para filho não removível vira divergência desfavorável e não remove', async () => {
      const { checkoutRepo, service } = setup();
      checkoutRepo.products = [COMBO];

      const result = await service.revalidate(
        baseRequest({
          items: [
            {
              productId: 'product-combo',
              removedChildIds: ['child-xis'],
              unitBasePriceCents: 5990,
              modifiers: [],
              quantity: 1,
              notes: null,
            },
          ],
        }),
        RESOLVED,
      );

      expect(result.items[0]?.comboComponents?.[0]).toMatchObject({ childProductId: 'child-xis', removed: false });
      expect(result.hasUnfavorableDivergence).toBe(true);
      expect(result.canSubmit).toBe(true);
    });

    it('remoção pedida para filho que não existe mais vira divergência desfavorável', async () => {
      const { checkoutRepo, service } = setup();
      checkoutRepo.products = [COMBO];

      const result = await service.revalidate(
        baseRequest({
          items: [
            {
              productId: 'product-combo',
              removedChildIds: ['child-sumiu'],
              unitBasePriceCents: 5990,
              modifiers: [],
              quantity: 1,
              notes: null,
            },
          ],
        }),
        RESOLVED,
      );

      expect(result.hasUnfavorableDivergence).toBe(true);
      expect(result.canSubmit).toBe(true);
    });
  });
});
