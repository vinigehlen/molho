import type { CheckoutRequest, RevalidatedCheckout, RevalidatedItem } from '@molho/contracts';
import type { ResolvedAddress } from '../geo/resolve-address';
import type { DeliveryMatchRepository } from '../storefront/delivery-match.repository';
import { computeStoreOpenState, isWithinAnyShift, localWeekdayAndMinutes, localWeekMinutes, slotOccurrenceRange } from '../storefront/store-hours';
import type {
  CheckoutCouponRecord,
  CheckoutRepository,
  CheckoutSchedulingSlotRecord,
  CheckoutStoreHoursRecord,
} from './checkout-revalidation.repository';

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
    const [store, hours, offers, zoneMatch, coupon, schedulingSlots] = await Promise.all([
      this.checkoutRepo.findStore(),
      this.checkoutRepo.listStoreHours(),
      this.checkoutRepo.findOffersForItems(request.items),
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
      // Épico conversão (C3). Mesmo racional do cupom — sem scheduledFor, sem consulta.
      request.scheduledFor ? this.checkoutRepo.listSchedulingSlots() : Promise.resolve<CheckoutSchedulingSlotRecord[]>([]),
    ]);

    const offerById = new Map(offers.map((offer) => [offer.id, offer]));
    const primaryOfferByProductId = new Map(
      offers.filter((offer) => offer.isPrimary).map((offer) => [offer.productId, offer]),
    );
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
      const offer = input.offerId
        ? offerById.get(input.offerId)
        : primaryOfferByProductId.get(input.productId);
      const validOffer = offer?.productId === input.productId ? offer : undefined;
      if (!validOffer || !validOffer.available) {
        hasUnfavorableDivergence = true;
        return unavailableItem(
          input,
          validOffer?.name ?? null,
          validOffer?.basePriceCents ?? input.unitBasePriceCents,
        );
      }

      // Combo: `fixed` preserva o preço da oferta; `sum_of_items` deriva a
      // base pelas ofertas principais dos filhos. Em ambos, perder qualquer
      // filho derruba o combo inteiro (regra 14: revisão obrigatória).
      let unitBasePriceCents = validOffer.basePriceCents;
      let comboComponents: RevalidatedItem['comboComponents'];
      if (validOffer.productKind === 'combo') {
        if (
          validOffer.comboComponents.length === 0 ||
          validOffer.comboComponents.some(
            (component) =>
              !component.available ||
              (validOffer.comboPricingMode === 'sum_of_items' &&
                component.unitBasePriceCents === null),
          )
        ) {
          hasUnfavorableDivergence = true;
          return unavailableItem(input, validOffer.name, validOffer.basePriceCents);
        }
        if (validOffer.comboPricingMode === 'sum_of_items') {
          unitBasePriceCents = validOffer.comboComponents.reduce(
            (sum, component) => sum + (component.unitBasePriceCents ?? 0) * component.quantity,
            0,
          );
        }
        comboComponents = validOffer.comboComponents.map((component) => ({
          childProductId: component.childProductId,
          name: component.name,
          quantity: component.quantity,
          ...(validOffer.comboPricingMode === 'sum_of_items'
            ? { unitBasePriceCents: component.unitBasePriceCents ?? 0 }
            : {}),
        }));
      }

      const modifierById = new Map(validOffer.modifiers.map((modifier) => [modifier.id, modifier]));
      const resolvedModifiers: RevalidatedItem['modifiers'] = [];
      for (const inputModifier of input.modifiers) {
        const modifier = modifierById.get(inputModifier.modifierId);
        // Modificador sumiu do produto (removido/esgotado) desde que o
        // cliente montou o carrinho — sem como reconstruir a mesma
        // composição, item some igual a produto indisponível.
        if (!modifier) {
          hasUnfavorableDivergence = true;
          return unavailableItem(input, validOffer.name, unitBasePriceCents);
        }
        resolvedModifiers.push({ modifierId: modifier.id, name: modifier.name, priceDeltaCents: modifier.priceDeltaCents });
      }

      const unitCents = unitBasePriceCents + resolvedModifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
      const clientUnitCents = input.unitBasePriceCents + input.modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
      const priceChanged = unitCents !== clientUnitCents;
      if (unitCents > clientUnitCents) hasUnfavorableDivergence = true;

      return {
        productId: validOffer.productId,
        offerId: validOffer.id,
        name: validOffer.name,
        available: true,
        unitBasePriceCents,
        modifiers: resolvedModifiers,
        quantity: input.quantity,
        notes: input.notes,
        lineTotalCents: unitCents * input.quantity,
        priceChanged,
        ...(comboComponents ? { comboComponents } : {}),
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

    // Épico conversão (C3). Mesma categoria de divergência do cupom: um
    // horário que cabia no slot no /revalidate e deixa de caber no
    // /checkout/orders (slot lotou, loja fechou o turno) é
    // hasUnfavorableDivergence, nunca campo separado pra UI decidir sozinha.
    // Sem scheduledFor, não é divergência — "o quanto antes" continua valendo.
    const timezone = store?.timezone ?? FALLBACK_TIMEZONE;
    const scheduledForValid = request.scheduledFor
      ? await this.isScheduledForUsable(new Date(request.scheduledFor), timezone, hours, schedulingSlots)
      : false;
    if (request.scheduledFor && !scheduledForValid) hasUnfavorableDivergence = true;

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
      scheduledFor: request.scheduledFor ?? null,
      scheduledForValid,
      totalCents: withinZone ? subtotalCents + (deliveryFeeCents ?? 0) - discountCents : null,
      hasUnfavorableDivergence,
      canSubmit,
    };
  }

  /**
   * Futuro, dentro do horário de funcionamento, cai num StoreSchedulingSlot
   * definido, e a OCORRÊNCIA específica desse slot (este dia civil, não a
   * recorrência semanal inteira) ainda tem vaga — os 4 pontos de "quando
   * agendamento é aceito" da doc de handoff. `countScheduledOrders` é
   * leitura OTIMISTA (mesmo racional de `isCouponUsable`); o incremento
   * atômico de verdade só acontece em
   * `CheckoutOrderRepository.claimSchedulingSlot`, no momento de criar o
   * pedido.
   */
  private async isScheduledForUsable(
    at: Date,
    timezone: string,
    hours: readonly CheckoutStoreHoursRecord[],
    slots: readonly CheckoutSchedulingSlotRecord[],
  ): Promise<boolean> {
    if (at.getTime() <= this.now().getTime()) return false;

    const { dayOfWeek, minutes } = localWeekdayAndMinutes(timezone, at);
    if (!isWithinAnyShift(hours, localWeekMinutes(timezone, at))) return false;

    const slot = slots.find(
      (s) => s.dayOfWeek === dayOfWeek && minutes >= s.startsAtMinutes && minutes < s.endsAtMinutes,
    );
    if (!slot) return false;

    const { start, end } = slotOccurrenceRange(timezone, at, slot);
    const scheduledCount = await this.checkoutRepo.countScheduledOrders(start, end);
    return scheduledCount < slot.maxOrders;
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
    offerId: input.offerId ?? null,
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
