import type { CheckoutRequest, RevalidatedCheckout, RevalidatedItem } from '@molho/contracts';
import type { DeliveryMatchRepository } from '../storefront/delivery-match.repository';
import { computeStoreOpenState } from '../storefront/store-hours';
import type { CheckoutRepository } from './checkout-revalidation.repository';

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';

/**
 * Núcleo de negócio do checkout (Épico 7): confere preço, disponibilidade,
 * zona de entrega, horário de funcionamento e pedido mínimo contra o banco —
 * nunca confia no que o cliente mandou (CLAUDE.md, cart.ts). Usado pelos
 * DOIS endpoints (`/checkout/revalidate` público e `/checkout/orders`
 * autenticado) com a MESMA lógica — o segundo nunca reaproveita o resultado
 * do primeiro, só chama de novo.
 *
 * `now` é injetável só pra teste determinístico de `isOpenNow`/`nextOpensAt`
 * — em produção sempre o relógio real (default do parâmetro).
 */
export class CheckoutRevalidationService {
  constructor(
    private readonly checkoutRepo: CheckoutRepository,
    private readonly deliveryMatchRepo: DeliveryMatchRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async revalidate(request: CheckoutRequest): Promise<RevalidatedCheckout> {
    const uniqueProductIds = [...new Set(request.items.map((item) => item.productId))];

    const [store, hours, products, zoneMatch] = await Promise.all([
      this.checkoutRepo.findStore(),
      this.checkoutRepo.listStoreHours(),
      this.checkoutRepo.findProductsByIds(uniqueProductIds),
      // Cidade E ponto: a zona por cidade decide a taxa da Cabanhas, a por
      // polígono continua valendo pra quem cobra por raio. No Bloco 2 a
      // cidade passa a vir do ViaCEP (via middleware) em vez do payload.
      this.deliveryMatchRepo.findMatchingZone({
        city: request.address.city,
        state: request.address.state,
        lat: request.address.lat,
        lng: request.address.lng,
      }),
    ]);

    const productById = new Map(products.map((product) => [product.id, product]));
    const { isOpenNow, nextOpensAt } = computeStoreOpenState(hours, store?.timezone ?? FALLBACK_TIMEZONE, this.now());
    const withinZone = zoneMatch !== null;

    let hasUnfavorableDivergence = !isOpenNow || !withinZone;
    if (withinZone && request.address.expectedDeliveryFeeCents !== null && zoneMatch.feeCents > request.address.expectedDeliveryFeeCents) {
      hasUnfavorableDivergence = true;
    }

    const items: RevalidatedItem[] = request.items.map((input) => {
      const product = productById.get(input.productId);
      if (!product || !product.available) {
        hasUnfavorableDivergence = true;
        return unavailableItem(input, product?.name ?? null, product?.basePriceCents ?? input.unitBasePriceCents);
      }

      const modifierById = new Map(product.modifiers.map((modifier) => [modifier.id, modifier]));
      const resolvedModifiers: RevalidatedItem['modifiers'] = [];
      for (const inputModifier of input.modifiers) {
        const modifier = modifierById.get(inputModifier.modifierId);
        // Modificador sumiu do produto (removido/esgotado) desde que o
        // cliente montou o carrinho — sem como reconstruir a mesma
        // composição, item some igual a produto indisponível.
        if (!modifier) {
          hasUnfavorableDivergence = true;
          return unavailableItem(input, product.name, product.basePriceCents);
        }
        resolvedModifiers.push({ modifierId: modifier.id, name: modifier.name, priceDeltaCents: modifier.priceDeltaCents });
      }

      const unitCents = product.basePriceCents + resolvedModifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
      const clientUnitCents = input.unitBasePriceCents + input.modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
      const priceChanged = unitCents !== clientUnitCents;
      if (unitCents > clientUnitCents) hasUnfavorableDivergence = true;

      return {
        productId: product.id,
        name: product.name,
        available: true,
        unitBasePriceCents: product.basePriceCents,
        modifiers: resolvedModifiers,
        quantity: input.quantity,
        notes: input.notes,
        lineTotalCents: unitCents * input.quantity,
        priceChanged,
      };
    });

    const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    const minOrderCents = store?.minOrderCents ?? 0;
    const belowMinimum = subtotalCents < minOrderCents;
    if (belowMinimum) hasUnfavorableDivergence = true;

    const anyUnavailable = items.some((item) => !item.available);
    const canSubmit = withinZone && isOpenNow && !belowMinimum && !anyUnavailable;

    const deliveryFeeCents = withinZone ? zoneMatch.feeCents : null;

    return {
      items,
      subtotalCents,
      withinZone,
      deliveryFeeCents,
      etaMinMinutes: withinZone ? zoneMatch.etaMinMinutes : null,
      etaMaxMinutes: withinZone ? zoneMatch.etaMaxMinutes : null,
      isOpenNow,
      nextOpensAt,
      minOrderCents,
      totalCents: withinZone ? subtotalCents + zoneMatch.feeCents : null,
      hasUnfavorableDivergence,
      canSubmit,
    };
  }
}

function unavailableItem(
  input: CheckoutRequest['items'][number],
  name: string | null,
  unitBasePriceCents: number,
): RevalidatedItem {
  return {
    productId: input.productId,
    name: name ?? '(produto removido do cardápio)',
    available: false,
    unitBasePriceCents,
    modifiers: [],
    quantity: input.quantity,
    notes: input.notes,
    lineTotalCents: 0,
    priceChanged: false,
  };
}
