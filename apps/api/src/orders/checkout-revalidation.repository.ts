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

export interface CheckoutRepository {
  findStore(): Promise<CheckoutStoreRecord | null>;
  listStoreHours(): Promise<CheckoutStoreHoursRecord[]>;
  findProductsByIds(productIds: readonly string[]): Promise<CheckoutProductRecord[]>;
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
}
