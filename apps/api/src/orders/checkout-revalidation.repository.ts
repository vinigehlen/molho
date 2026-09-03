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
  /** Filho direto do combo pedido. Em netos, aponta para o combo-filho raiz. */
  rootChildProductId: string;
  /** 1 = filho direto; 2 = neto vindo de combo aninhado. */
  depth: number;
  /** Cliente pode remover este filho do combo (4.2B). */
  removable: boolean;
  /** Preço da oferta principal viva do filho, usado quando o combo é `sum_of_items`. */
  unitBasePriceCents: number | null;
  /** `childProduct.available` E oferta principal do filho disponível. */
  available: boolean;
}

export interface CheckoutOfferRecord {
  id: string;
  productId: string;
  categoryId: string;
  isPrimary: boolean;
  name: string;
  basePriceCents: number;
  available: boolean;
  comboPricingMode: 'fixed' | 'sum_of_items';
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

/** Recorte de Promotion que o checkout precisa para escolher o melhor desconto por item. */
export interface CheckoutPromotionRecord {
  id: string;
  name: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  weekdays: number[];
  startTime: string;
  endTime: string;
  scope: 'store_wide' | 'category' | 'product';
  scopeId: string | null;
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
  listActivePromotions(): Promise<CheckoutPromotionRecord[]>;
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

const MAX_COMBO_COMPONENT_DEPTH = 2;

type ProductKind = CheckoutOfferRecord['productKind'];

interface ComboProductNode {
  id: string;
  name: string;
  kind: ProductKind;
  available: boolean;
  primaryOffer: { priceCents: number; available: boolean; comboPricingMode: 'fixed' | 'sum_of_items' } | null;
}

interface ComboTreeRow {
  comboProductId: string;
  childProductId: string;
  quantity: number;
  removable: boolean;
  childProduct: ComboProductNode;
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
        categoryId: true,
        isPrimary: true,
        priceCents: true,
        available: true,
        comboPricingMode: true,
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
          },
        },
      },
    });
    const comboComponentsByProductId = await this.findComboComponents(
      rows.filter((row) => row.product.kind === 'combo').map((row) => row.productId),
    );
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      categoryId: row.categoryId,
      isPrimary: row.isPrimary,
      name: row.product.name,
      basePriceCents: row.priceCents,
      available: row.available,
      comboPricingMode: row.comboPricingMode,
      productKind: row.product.kind,
      modifiers: row.product.productModifierGroups.flatMap(
        (link) => link.modifierGroup.modifiers,
      ),
      comboComponents: comboComponentsByProductId.get(row.productId) ?? [],
    }));
  }

  private async findComboComponents(comboProductIds: readonly string[]): Promise<Map<string, CheckoutComboComponentRecord[]>> {
    const rootIds = [...new Set(comboProductIds)];
    const childrenByParent = new Map<string, ComboTreeRow[]>();
    const productById = new Map<string, ComboProductNode>();
    let frontier = rootIds;
    const expandedParents = new Set<string>();

    for (let depth = 0; depth < MAX_COMBO_COMPONENT_DEPTH; depth += 1) {
      const parents = frontier.filter((productId) => !expandedParents.has(productId));
      if (parents.length === 0) break;
      parents.forEach((productId) => expandedParents.add(productId));

      const rows = await this.findDirectComboRows(parents);
      frontier = [];
      for (const row of rows) {
        const childProduct = row.childProduct;
        productById.set(row.childProductId, childProduct);
        const siblings = childrenByParent.get(row.comboProductId) ?? [];
        siblings.push({
          comboProductId: row.comboProductId,
          childProductId: row.childProductId,
          quantity: row.quantity,
          removable: row.removable,
          childProduct,
        });
        childrenByParent.set(row.comboProductId, siblings);
        if (childProduct.kind === 'combo') frontier.push(row.childProductId);
      }
    }

    const result = new Map<string, CheckoutComboComponentRecord[]>();
    for (const rootId of rootIds) {
      result.set(rootId, this.flattenComboComponents(rootId, childrenByParent, productById));
    }
    return result;
  }

  private async findDirectComboRows(comboProductIds: readonly string[]): Promise<ComboTreeRow[]> {
    const ids = [...new Set(comboProductIds)];
    if (ids.length === 0) return [];
    const tenantId = this.requestContext.getTenantId();
    const rows = await this.requestContext.getClient().$queryRaw<
      {
        comboProductId: string;
        childProductId: string;
        quantity: number;
        removable: boolean;
        childName: string;
        childKind: ProductKind;
        childAvailable: boolean;
        childOfferPriceCents: number | null;
        childOfferAvailable: boolean | null;
        childOfferComboPricingMode: 'fixed' | 'sum_of_items' | null;
      }[]
    >`
      SELECT
        ci."combo_product_id" AS "comboProductId",
        ci."child_product_id" AS "childProductId",
        ci."quantity",
        ci."removable",
        p."name" AS "childName",
        p."kind" AS "childKind",
        p."available" AS "childAvailable",
        po."price_cents" AS "childOfferPriceCents",
        po."available" AS "childOfferAvailable",
        po."combo_pricing_mode" AS "childOfferComboPricingMode"
      FROM "combo_items" ci
      INNER JOIN "products" p
        ON p."id" = ci."child_product_id"
       AND p."tenant_id" = ci."tenant_id"
       AND p."deleted_at" IS NULL
      LEFT JOIN "product_offers" po
        ON po."product_id" = p."id"
       AND po."tenant_id" = p."tenant_id"
       AND po."is_primary" = true
       AND po."deleted_at" IS NULL
      WHERE ci."tenant_id" = ${tenantId}::uuid
        AND ci."combo_product_id" = ANY(${ids}::uuid[])
        AND ci."deleted_at" IS NULL
      ORDER BY ci."combo_product_id", ci."sort_order", ci."created_at"
    `;
    return rows.map((row) => ({
      comboProductId: row.comboProductId,
      childProductId: row.childProductId,
      quantity: row.quantity,
      removable: row.removable,
      childProduct: {
        id: row.childProductId,
        name: row.childName,
        kind: row.childKind,
        available: row.childAvailable,
        primaryOffer:
          row.childOfferPriceCents === null ||
          row.childOfferAvailable === null ||
          row.childOfferComboPricingMode === null
            ? null
            : {
                priceCents: row.childOfferPriceCents,
                available: row.childOfferAvailable,
                comboPricingMode: row.childOfferComboPricingMode,
              },
      },
    }));
  }

  private flattenComboComponents(
    comboProductId: string,
    childrenByParent: ReadonlyMap<string, readonly ComboTreeRow[]>,
    productById: ReadonlyMap<string, ComboProductNode>,
  ): CheckoutComboComponentRecord[] {
    const components: CheckoutComboComponentRecord[] = [];

    const visit = (
      parentProductId: string,
      multiplier: number,
      depth: number,
      rootChildProductId: string | null,
      stack: ReadonlySet<string>,
    ) => {
      if (depth >= MAX_COMBO_COMPONENT_DEPTH || stack.has(parentProductId)) return;
      const children = childrenByParent.get(parentProductId) ?? [];
      for (const child of children) {
        const nextRootChildProductId = rootChildProductId ?? child.childProductId;
        const nextDepth = depth + 1;
        const quantity = child.quantity * multiplier;
        components.push({
          childProductId: child.childProductId,
          name: child.childProduct.name,
          quantity,
          rootChildProductId: nextRootChildProductId,
          depth: nextDepth,
          removable: nextDepth === 1 ? child.removable : false,
          unitBasePriceCents: this.comboChildUnitPrice(child.childProductId, childrenByParent, productById, new Set([parentProductId])),
          available: this.comboChildAvailable(child.childProductId, childrenByParent, productById, new Set([parentProductId])),
        });
        if (child.childProduct.kind === 'combo') {
          visit(child.childProductId, quantity, nextDepth, nextRootChildProductId, new Set([...stack, parentProductId]));
        }
      }
    };

    visit(comboProductId, 1, 0, null, new Set());
    return components;
  }

  private comboChildUnitPrice(
    productId: string,
    childrenByParent: ReadonlyMap<string, readonly ComboTreeRow[]>,
    productById: ReadonlyMap<string, ComboProductNode>,
    stack: ReadonlySet<string>,
  ): number | null {
    if (stack.has(productId)) return null;
    const product = productById.get(productId);
    const offer = product?.primaryOffer ?? null;
    if (!product || !offer) return null;
    if (product.kind !== 'combo' || offer.comboPricingMode !== 'sum_of_items') return offer.priceCents;

    const children = childrenByParent.get(productId) ?? [];
    if (children.length === 0) return null;
    let total = 0;
    for (const child of children) {
      const childPrice = this.comboChildUnitPrice(child.childProductId, childrenByParent, productById, new Set([...stack, productId]));
      if (childPrice === null) return null;
      total += childPrice * child.quantity;
    }
    return total;
  }

  private comboChildAvailable(
    productId: string,
    childrenByParent: ReadonlyMap<string, readonly ComboTreeRow[]>,
    productById: ReadonlyMap<string, ComboProductNode>,
    stack: ReadonlySet<string>,
  ): boolean {
    if (stack.has(productId)) return false;
    const product = productById.get(productId);
    const offer = product?.primaryOffer ?? null;
    if (!product || !offer || !product.available || !offer.available) return false;
    if (product.kind !== 'combo') return true;

    const children = childrenByParent.get(productId) ?? [];
    return children.length > 0 && children.every(
      (child) => this.comboChildAvailable(child.childProductId, childrenByParent, productById, new Set([...stack, productId])),
    );
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

  async listActivePromotions(): Promise<CheckoutPromotionRecord[]> {
    return this.requestContext.getClient().promotion.findMany({
      where: { active: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        discountType: true,
        discountValue: true,
        weekdays: true,
        startTime: true,
        endTime: true,
        scope: true,
        scopeId: true,
      },
    });
  }
}
