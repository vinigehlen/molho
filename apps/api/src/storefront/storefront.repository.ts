import type { RequestContextService } from '../context/request-context.service';
import type { Weekday } from './store-hours';

export interface StorefrontTenantRecord {
  slug: string;
  name: string;
  themeKey: string;
  timezone: string;
}

export interface StorefrontStoreRecord {
  addressText: string;
  phone: string | null;
  whatsappNumber: string | null;
  minOrderCents: number;
  timezone: string;
  /** Épico 8 (docs/02 §5.5) — pré-requisito de config pra oferecer `pix` no seletor de pagamento. */
  pixKey: string | null;
  pixKeyType: string | null;
  pixMerchantCity: string | null;
}

export interface StorefrontHoursRecord {
  dayOfWeek: Weekday;
  opensAtMinutes: number;
  closesAtMinutes: number;
}

export interface StorefrontModifierRecord {
  id: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  priceDeltaCents: number;
}

export interface StorefrontModifierGroupRecord {
  id: string;
  name: string;
  min: number;
  max: number;
  modifiers: StorefrontModifierRecord[];
}

export interface StorefrontProductRecord {
  id: string;
  offerId: string;
  isPrimary: boolean;
  name: string;
  description: string | null;
  basePriceCents: number;
  comboPricingMode: 'fixed' | 'sum_of_items';
  imageKey: string | null;
  /**
   * Galeria (Épico conversão, C1), já em ordem de `position`. Pode vir vazia
   * num produto que nunca migrou pra `ProductImage` — `imageKey` acima
   * continua sendo o fallback de capa nesse caso (StorefrontService resolve).
   */
  images: { imageKey: string }[];
  available: boolean;
  modifierGroups: StorefrontModifierGroupRecord[];
  /** `combo` (fase 3). Só o storefront novo (opt-in) lê isto. */
  kind: 'prepared' | 'industrialized' | 'combo';
  /** Filhos do combo (fase 4.1b) — vazio em produto não-combo. */
  comboItems: { childProductId: string; name: string; quantity: number; removable: boolean; unitBasePriceCents: number | null }[];
}

export interface StorefrontCategoryRecord {
  id: string;
  name: string;
  products: StorefrontProductRecord[];
}

export interface StorefrontRepository {
  findTenant(): Promise<StorefrontTenantRecord | null>;
  findStore(): Promise<StorefrontStoreRecord | null>;
  listMenu(): Promise<StorefrontCategoryRecord[]>;
  listStoreHours(): Promise<StorefrontHoursRecord[]>;
}

/**
 * Leitura pública do cardápio. Nenhum método recebe `tenantId`: quem chama já
 * está dentro do `RequestContextService.run()` aberto por
 * `TenantContextInterceptor` a partir do slug da URL, e o RLS filtra tudo pelo
 * GUC `app.tenant_id`. É a mesma garantia que protege as rotas de backoffice —
 * a rota ser pública muda quem PODE chamar, não o isolamento entre tenants.
 *
 * O cardápio inteiro sai em UMA query aninhada (decisão do Épico 5). Prisma
 * traduz esse `select` em joins, então não é o problema de N+1 que a forma
 * aninhada sugere.
 */
export class PrismaStorefrontRepository implements StorefrontRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findTenant(): Promise<StorefrontTenantRecord | null> {
    return this.requestContext.getClient().tenant.findFirst({
      where: { deletedAt: null },
      select: { slug: true, name: true, themeKey: true, timezone: true },
    });
  }

  /**
   * Multi-loja é Premium/Fase 3 — no MVP o tenant tem uma loja só, e é dela
   * que saem endereço, telefone e pedido mínimo do cabeçalho. `findFirst`
   * ordenado por `createdAt` mantém a escolha determinística (sempre a loja
   * original) em vez de depender da ordem que o Postgres devolver.
   */
  async findStore(): Promise<StorefrontStoreRecord | null> {
    return this.requestContext.getClient().store.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        addressText: true,
        phone: true,
        whatsappNumber: true,
        minOrderCents: true,
        timezone: true,
        pixKey: true,
        pixKeyType: true,
        pixMerchantCity: true,
      },
    });
  }

  /**
   * Mesma suposição de `findStore()` (uma loja por tenant no MVP) — RLS já
   * escopa por tenant, então não precisa de `storeId` explícito.
   */
  async listStoreHours(): Promise<StorefrontHoursRecord[]> {
    return this.requestContext.getClient().storeHours.findMany({
      where: { deletedAt: null },
      select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true },
    });
  }

  /**
   * Categoria invisível (`visible: false`) some do cardápio inteira. Produto
   * ESGOTADO (`available: false`) continua aparecendo, de propósito: o cliente
   * precisa ver que o item existe e acabou hoje — sumir com ele parece
   * cardápio menor, e o card esgotado é um padrão explícito do design system
   * (MoProductCard, doc de marca §5.2).
   *
   * Grupos seguem a ordem do vínculo com o produto. As opções seguem o
   * `sortOrder` editável da biblioteca, com `createdAt` como desempate para
   * dados antigos migrados com a mesma posição.
   */
  async listMenu(): Promise<StorefrontCategoryRecord[]> {
    const categories = await this.requestContext.getClient().category.findMany({
      where: { visible: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        offers: {
          where: { deletedAt: null, product: { deletedAt: null } },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            isPrimary: true,
            priceCents: true,
            available: true,
            comboPricingMode: true,
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                kind: true,
                imageKey: true,
                images: {
                  where: { deletedAt: null },
                  orderBy: { position: 'asc' },
                  select: { imageKey: true },
                },
                // Composição do combo (fase 4.1b) — exibição pura. Filho
                // esgotado/removido não some da lista aqui; quem barra o
                // pedido é a revalidação do checkout.
                comboItems: {
                  where: { deletedAt: null, childProduct: { deletedAt: null } },
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    childProductId: true,
                    quantity: true,
                    removable: true,
                    childProduct: {
                      select: {
                        name: true,
                        kind: true,
                        offers: {
                          where: { isPrimary: true, deletedAt: null },
                          select: { priceCents: true, comboPricingMode: true },
                        },
                        comboItems: {
                          where: { deletedAt: null, childProduct: { deletedAt: null } },
                          orderBy: { sortOrder: 'asc' },
                          select: {
                            quantity: true,
                            childProduct: {
                              select: {
                                offers: {
                                  where: { isPrimary: true, deletedAt: null },
                                  select: { priceCents: true },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                // Reuso (exceção MVP 2026-08-28, fase 2/4): "grupos deste
                // produto" é sempre o VÍNCULO (product_modifier_groups).
                productModifierGroups: {
                  where: { deletedAt: null, modifierGroup: { deletedAt: null, active: true } },
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                  select: {
                    modifierGroup: {
                      select: {
                        id: true,
                        name: true,
                        min: true,
                        max: true,
                        modifiers: {
                          where: { deletedAt: null, active: true },
                          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                          select: {
                            id: true,
                            name: true,
                            description: true,
                            imageKey: true,
                            priceDeltaCents: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      products: category.offers.map((offer) => ({
        id: offer.product.id,
        offerId: offer.id,
        isPrimary: offer.isPrimary,
        name: offer.product.name,
        description: offer.product.description,
        basePriceCents: storefrontOfferBasePriceCents(offer),
        comboPricingMode: offer.comboPricingMode,
        imageKey: offer.product.imageKey,
        images: offer.product.images,
        available: offer.available,
        modifierGroups: offer.product.productModifierGroups.map((link) => link.modifierGroup),
        kind: offer.product.kind,
        comboItems: offer.product.comboItems.map((item) => ({
          childProductId: item.childProductId,
          name: item.childProduct.name,
          quantity: item.quantity,
          removable: item.removable,
          unitBasePriceCents: storefrontComboChildPriceCents(item.childProduct) ?? null,
        })),
      })),
    }));
  }
}

function storefrontOfferBasePriceCents(offer: {
  priceCents: number;
  comboPricingMode: 'fixed' | 'sum_of_items';
  product: {
    kind: 'prepared' | 'industrialized' | 'combo';
    comboItems: readonly {
      quantity: number;
      childProduct: StorefrontComboChildForPrice;
    }[];
  };
}): number {
  if (
    offer.product.kind !== 'combo' ||
    offer.comboPricingMode !== 'sum_of_items' ||
    offer.product.comboItems.length === 0
  ) {
    return offer.priceCents;
  }

  let total = 0;
  for (const item of offer.product.comboItems) {
    const childPriceCents = storefrontComboChildPriceCents(item.childProduct);
    if (childPriceCents === undefined) return offer.priceCents;
    total += childPriceCents * item.quantity;
  }
  return total;
}

interface StorefrontComboChildForPrice {
  kind: 'prepared' | 'industrialized' | 'combo';
  offers: readonly { priceCents: number; comboPricingMode?: 'fixed' | 'sum_of_items' }[];
  comboItems: readonly {
    quantity: number;
    childProduct: { offers: readonly { priceCents: number }[] };
  }[];
}

function storefrontComboChildPriceCents(childProduct: StorefrontComboChildForPrice): number | undefined {
  const primaryOffer = childProduct.offers[0];
  if (!primaryOffer) return undefined;
  if (childProduct.kind !== 'combo' || primaryOffer.comboPricingMode !== 'sum_of_items') {
    return primaryOffer.priceCents;
  }

  if (childProduct.comboItems.length === 0) return primaryOffer.priceCents;
  let total = 0;
  for (const item of childProduct.comboItems) {
    const childPriceCents = item.childProduct.offers[0]?.priceCents;
    if (childPriceCents === undefined) return primaryOffer.priceCents;
    total += childPriceCents * item.quantity;
  }
  return total;
}
