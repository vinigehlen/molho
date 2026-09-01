import type { RequestContextService } from '../context/request-context.service';
import type { Weekday } from '../storefront/store-hours';

export interface CheckoutStoreRecord {
  minOrderCents: number;
  timezone: string;
}

export interface CheckoutStoreHoursRecord {
  dayOfWeek: Weekday;
  opensAtMinutes: number;
  closesAtMinutes: number;
}

export interface CheckoutModifierRecord {
  id: string;
  name: string;
  priceDeltaCents: number;
}

/** Um filho de combo, já com a disponibilidade resolvida (produto + oferta
 * principal). Só preenchido quando `CheckoutOfferRecord.productKind === 'combo'`. */
export interface CheckoutComboComponentRecord {
  childProductId: string;
  name: string;
  quantity: number;
  /** `childProduct.available` E oferta principal do filho disponível. */
  available: boolean;
}

export interface CheckoutOfferRecord {
  id: string;
  productId: string;
  isPrimary: boolean;
  name: string;
  basePriceCents: number;
  available: boolean;
  /** Natureza do produto (fase 3). `combo` liga a cascata de disponibilidade. */
  productKind: 'prepared' | 'industrialized' | 'combo';
  /**
   * Achatado de todos os grupos do produto — o checkout confere apenas
   * "este modificador pertence a este produto e este é o preço dele agora",
   * não min/max de grupo (isso já é validado no storefront, na montagem do
   * carrinho; MoProductSheet não deixa montar seleção fora de min/max).
   * Reforçar min/max de novo aqui é debito documentado, não esquecimento —
   * escopo deste serviço é preço/disponibilidade/zona/horário/mínimo, os 5
   * pontos pedidos pro Épico 7.
   */
  modifiers: CheckoutModifierRecord[];
  /** Filhos do combo (fase 4.1b). Vazio em produto não-combo. */
  comboComponents: CheckoutComboComponentRecord[];
}

/** Recorte de Coupon que o checkout precisa pra decidir aplicabilidade (Épico conversão, C2) — nunca o Coupon inteiro. */
export interface CheckoutCouponRecord {
  discountType: 'percent' | 'fixed';
  discountPercent: number | null;
  discountValueCents: number | null;
  minOrderCents: number;
  startsAt: Date;
  endsAt: Date;
  maxUses: number;
  usesCount: number;
  active: boolean;
}

/** Recorte de StoreSchedulingSlot que o checkout precisa (Épico conversão, C3) — nunca a linha inteira. */
export interface CheckoutSchedulingSlotRecord {
  dayOfWeek: Weekday;
  startsAtMinutes: number;
  endsAtMinutes: number;
  maxOrders: number;
}

export interface CheckoutRepository {
  findStore(): Promise<CheckoutStoreRecord | null>;
  listStoreHours(): Promise<CheckoutStoreHoursRecord[]>;
  findOffersForItems(
    items: readonly { productId: string; offerId?: string }[],
  ): Promise<CheckoutOfferRecord[]>;
  /** `mode: 'insensitive'` — mesma comparação do índice único parcial em upper(code) (packages/db). */
  findCoupon(code: string): Promise<CheckoutCouponRecord | null>;
  listSchedulingSlots(): Promise<CheckoutSchedulingSlotRecord[]>;
  /**
   * Contagem OTIMISTA (leitura, sem lock) de pedidos já agendados na
   * ocorrência [start, end) — mesmo racional de `isCouponUsable` ler
   * `usesCount < maxUses` sem travar: só fecha a corrida de verdade o
   * incremento atômico em `CheckoutOrderRepository.claimSchedulingSlot`, no
   * momento de criar o pedido.
   */
  countScheduledOrders(start: Date, end: Date): Promise<number>;
}

/**
 * Mesma suposição de `StorefrontRepository` (uma loja por tenant no MVP,
 * `findFirst` ordenado por `createdAt` pra determinismo) — RLS escopa por
 * tenant, nenhum método recebe `tenantId`.
 */
export class PrismaCheckoutRepository implements CheckoutRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findStore(): Promise<CheckoutStoreRecord | null> {
    return this.requestContext.getClient().store.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { minOrderCents: true, timezone: true },
    });
  }

  async listStoreHours(): Promise<CheckoutStoreHoursRecord[]> {
    return this.requestContext.getClient().storeHours.findMany({
      where: { deletedAt: null },
      select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true },
    });
  }

  async findOffersForItems(
    items: readonly { productId: string; offerId?: string }[],
  ): Promise<CheckoutOfferRecord[]> {
    if (items.length === 0) return [];
    const offerIds = [...new Set(items.flatMap((item) => (item.offerId ? [item.offerId] : [])))];
    const fallbackProductIds = [
      ...new Set(items.filter((item) => !item.offerId).map((item) => item.productId)),
    ];
    const rows = await this.requestContext.getClient().productOffer.findMany({
      where: {
        deletedAt: null,
        product: { deletedAt: null },
        OR: [
          ...(offerIds.length > 0 ? [{ id: { in: offerIds } }] : []),
          ...(fallbackProductIds.length > 0
            ? [{ productId: { in: fallbackProductIds }, isPrimary: true }]
            : []),
        ],
      },
      select: {
        id: true,
        productId: true,
        isPrimary: true,
        priceCents: true,
        available: true,
        product: {
          select: {
            name: true,
            kind: true,
            // A allowlist de modificadores continua na identidade do
            // produto; todas as apresentações compartilham a composição.
            productModifierGroups: {
              where: { deletedAt: null, modifierGroup: { deletedAt: null, active: true } },
              select: {
                modifierGroup: {
                  select: {
                    modifiers: {
                      where: { deletedAt: null, active: true },
                      select: { id: true, name: true, priceDeltaCents: true },
                    },
                  },
                },
              },
            },
            // Filhos do combo (fase 4.1b) — disponibilidade do filho =
            // produto disponível E oferta principal do filho disponível.
            comboItems: {
              where: { deletedAt: null, childProduct: { deletedAt: null } },
              orderBy: { sortOrder: 'asc' },
              select: {
                quantity: true,
                childProductId: true,
                childProduct: {
                  select: {
                    name: true,
                    available: true,
                    offers: {
                      where: { isPrimary: true, deletedAt: null },
                      select: { available: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      isPrimary: row.isPrimary,
      name: row.product.name,
      basePriceCents: row.priceCents,
      available: row.available,
      productKind: row.product.kind,
      modifiers: row.product.productModifierGroups.flatMap(
        (link) => link.modifierGroup.modifiers,
      ),
      comboComponents: row.product.comboItems.map((item) => ({
        childProductId: item.childProductId,
        name: item.childProduct.name,
        quantity: item.quantity,
        available: item.childProduct.available && item.childProduct.offers[0]?.available === true,
      })),
    }));
  }

  async listSchedulingSlots(): Promise<CheckoutSchedulingSlotRecord[]> {
    return this.requestContext.getClient().storeSchedulingSlot.findMany({
      where: { deletedAt: null },
      select: { dayOfWeek: true, startsAtMinutes: true, endsAtMinutes: true, maxOrders: true },
    });
  }

  async countScheduledOrders(start: Date, end: Date): Promise<number> {
    return this.requestContext.getClient().order.count({
      where: { scheduledFor: { gte: start, lt: end } },
    });
  }

  async findCoupon(code: string): Promise<CheckoutCouponRecord | null> {
    return this.requestContext.getClient().coupon.findFirst({
      where: { code: { equals: code, mode: 'insensitive' }, deletedAt: null },
      select: {
        discountType: true,
        discountPercent: true,
        discountValueCents: true,
        minOrderCents: true,
        startsAt: true,
        endsAt: true,
        maxUses: true,
        usesCount: true,
        active: true,
      },
    });
  }
}
