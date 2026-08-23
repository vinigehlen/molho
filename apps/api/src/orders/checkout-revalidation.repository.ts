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

export interface CheckoutProductRecord {
  id: string;
  name: string;
  basePriceCents: number;
  available: boolean;
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
  findProductsByIds(productIds: readonly string[]): Promise<CheckoutProductRecord[]>;
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

  async findProductsByIds(productIds: readonly string[]): Promise<CheckoutProductRecord[]> {
    if (productIds.length === 0) return [];
    const rows = await this.requestContext.getClient().product.findMany({
      where: { id: { in: [...productIds] }, deletedAt: null },
      select: {
        id: true,
        name: true,
        basePriceCents: true,
        available: true,
        modifierGroups: {
          where: { deletedAt: null },
          select: {
            modifiers: { where: { deletedAt: null }, select: { id: true, name: true, priceDeltaCents: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      basePriceCents: row.basePriceCents,
      available: row.available,
      modifiers: row.modifierGroups.flatMap((group) => group.modifiers),
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
