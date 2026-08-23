import type { CheckoutRequest, RevalidatedCheckout, RevalidatedItem } from '@molho/contracts';
import type { ResolvedAddress } from '../geo/resolve-address';
import type { DeliveryMatchRepository } from '../storefront/delivery-match.repository';
import { computeStoreOpenState } from '../storefront/store-hours';
import type { CheckoutCouponRecord, CheckoutRepository } from './checkout-revalidation.repository';

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

  /**
   * `resolved` vem do middleware de geocode — este service NUNCA geocoda
   * (regra de lint em eslint.config.mjs: HTTP externo dentro da transação de
   * request esgota o pool). A taxa sai da CIDADE resolvida; `lat`/`lng` só
   * alimentam zona por raio e podem ser nulos sem bloquear nada.
   *
   * `resolved: null` ⟺ `request.fulfillmentType === 'pickup'` (garantido pelo
   * controller — pickup nunca geocoda, não tem endereço pra geocodar). Pickup
   * pula a zona inteira: não existe "fora da área" pra quem retira no balcão,
   * `withinZone` fica sempre `true` e a taxa sempre `0`.
   */
  async revalidate(request: CheckoutRequest, resolved: ResolvedAddress | null): Promise<RevalidatedCheckout> {
    const isPickup = request.fulfillmentType === 'pickup';
    const uniqueProductIds = [...new Set(request.items.map((item) => item.productId))];

    const [store, hours, products, zoneMatch, coupon] = await Promise.all([
      this.checkoutRepo.findStore(),
      this.checkoutRepo.listStoreHours(),
      this.checkoutRepo.findProductsByIds(uniqueProductIds),
      // Cidade E ponto: a zona por cidade decide a taxa da Cabanhas, a por
      // polígono continua valendo pra quem cobra por raio. `resolved` só é
      // `null` em pickup (invariante do controller) — sem zona nenhuma a checar.
      resolved === null
        ? Promise.resolve(null)
        : this.deliveryMatchRepo.findMatchingZone({
            city: resolved.city,
            state: resolved.state,
            lat: resolved.lat,
            lng: resolved.lng,
          }),
      // Épico conversão (C2). Sem couponCode no request, nem consulta —
      // não vale gastar round-trip num cupom que ninguém pediu.
      request.couponCode ? this.checkoutRepo.findCoupon(request.couponCode) : Promise.resolve(null),
    ]);

    const productById = new Map(products.map((product) => [product.id, product]));
    const { isOpenNow, nextOpensAt } = computeStoreOpenState(hours, store?.timezone ?? FALLBACK_TIMEZONE, this.now());
    const withinZone = isPickup || zoneMatch !== null;

    let hasUnfavorableDivergence = !isOpenNow || !withinZone;
    if (
      !isPickup &&
      withinZone &&
      request.address &&
      request.address.expectedDeliveryFeeCents !== null &&
      zoneMatch &&
      zoneMatch.feeCents > request.address.expectedDeliveryFeeCents
    ) {
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

    // Épico conversão (C2). couponValid=false com couponCode PRESENTE é a
    // MESMA categoria de "item ficou indisponível" (regra 14) — o cliente
    // viu um desconto que já não vale mais (esgotou, expirou, caiu abaixo do
    // mínimo por causa de item removido) e precisa de tela de confirmação,
    // não um toast. Sem couponCode nenhum, isto não entra em jogo —
    // couponValid fica false mas SEM marcar divergência (não é "perdeu
    // algo", é "nunca pediu nada").
    const couponValid = coupon !== null && isCouponUsable(coupon, this.now(), subtotalCents);
    if (request.couponCode && !couponValid) hasUnfavorableDivergence = true;
    const discountCents = coupon && couponValid ? computeDiscountCents(coupon, subtotalCents) : 0;

    const anyUnavailable = items.some((item) => !item.available);
    const canSubmit = withinZone && isOpenNow && !belowMinimum && !anyUnavailable;

    // Pickup: taxa sempre 0, sem ETA de entrega (não há o que estimar).
    // Delivery: mesma lógica de sempre — zoneMatch só existe se withinZone.
    const deliveryFeeCents = isPickup ? 0 : withinZone && zoneMatch ? zoneMatch.feeCents : null;
    const etaMinMinutes = isPickup ? null : withinZone && zoneMatch ? zoneMatch.etaMinMinutes : null;
    const etaMaxMinutes = isPickup ? null : withinZone && zoneMatch ? zoneMatch.etaMaxMinutes : null;

    return {
      items,
      subtotalCents,
      withinZone,
      deliveryFeeCents,
      etaMinMinutes,
      etaMaxMinutes,
      isOpenNow,
      nextOpensAt,
      minOrderCents,
      couponCode: request.couponCode ?? null,
      couponValid,
      discountCents,
      totalCents: withinZone ? subtotalCents + (deliveryFeeCents ?? 0) - discountCents : null,
      hasUnfavorableDivergence,
      canSubmit,
    };
  }
}

/**
 * Ativo, dentro da validade, ainda tem uso disponível, e o subtotal atinge o
 * mínimo do cupom — as 4 checagens de "existe/ativo/dentro da validade/
 * atingiu o mínimo/ainda tem uso" da doc de handoff (usesCount < maxUses é a
 * leitura otimista aqui; o incremento ATÔMICO de verdade — que fecha a
 * corrida no último uso — só acontece em CheckoutOrderRepository.claimCoupon,
 * no momento de CRIAR o pedido, não aqui na revalidação de leitura).
 */
function isCouponUsable(coupon: CheckoutCouponRecord, now: Date, subtotalCents: number): boolean {
  return (
    coupon.active &&
    now >= coupon.startsAt &&
    now <= coupon.endsAt &&
    coupon.usesCount < coupon.maxUses &&
    subtotalCents >= coupon.minOrderCents
  );
}

/** Descontado só do SUBTOTAL, nunca da taxa de entrega — nunca excede o subtotal (CHECK orders_discount_cents_check permite até subtotal+fee, mas o v1 é mais conservador de propósito). */
function computeDiscountCents(coupon: CheckoutCouponRecord, subtotalCents: number): number {
  const raw =
    coupon.discountType === 'percent'
      ? Math.round((subtotalCents * (coupon.discountPercent ?? 0)) / 100)
      : (coupon.discountValueCents ?? 0);
  return Math.min(raw, subtotalCents);
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
