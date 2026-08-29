import type { RequestContextService } from '../context/request-context.service';
import type { CatalogActor } from './catalog-actor';
import { CatalogNotFoundError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface ProductOfferRecord {
  id: string;
  productId: string;
  categoryId: string;
  priceCents: number;
  available: boolean;
  pdvCode: string | null;
  sortOrder: number;
  isPrimary: boolean;
  version: number;
}

export interface ProductOfferFilter {
  productId?: string;
  categoryId?: string;
}

export interface UpdateProductOfferInput {
  categoryId?: string;
  priceCents?: number;
  pdvCode?: string | null;
  sortOrder?: number;
}

export interface ProductOfferRepository {
  list(filter: ProductOfferFilter): Promise<ProductOfferRecord[]>;
  findById(id: string): Promise<ProductOfferRecord | null>;
  categoryExists(categoryId: string): Promise<boolean>;
  update(
    id: string,
    expectedVersion: number,
    input: UpdateProductOfferInput,
    actor: CatalogActor,
  ): Promise<ProductOfferRecord>;
  setAvailable(
    id: string,
    expectedVersion: number,
    available: boolean,
  ): Promise<ProductOfferRecord>;
}

const SELECT = {
  id: true,
  productId: true,
  categoryId: true,
  priceCents: true,
  available: true,
  pdvCode: true,
  sortOrder: true,
  isPrimary: true,
  version: true,
} as const;

export class PrismaProductOfferRepository implements ProductOfferRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async list(filter: ProductOfferFilter): Promise<ProductOfferRecord[]> {
    return this.requestContext.getClient().productOffer.findMany({
      where: {
        deletedAt: null,
        ...(filter.productId ? { productId: filter.productId } : {}),
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      },
      select: SELECT,
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async findById(id: string): Promise<ProductOfferRecord | null> {
    return this.requestContext.getClient().productOffer.findFirst({
      where: { id, deletedAt: null },
      select: SELECT,
    });
  }

  async categoryExists(categoryId: string): Promise<boolean> {
    const category = await this.requestContext.getClient().category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    return category !== null;
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateProductOfferInput,
    actor: CatalogActor,
  ): Promise<ProductOfferRecord> {
    const client = this.requestContext.getClient();
    const before = await this.findById(id);
    if (!before) throw new CatalogNotFoundError('Oferta');

    const result = await client.productOffer.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate(
      'Oferta',
      result.count,
      async () => (await this.findById(id)) !== null,
    );
    const after = await this.findByIdOrThrow(id);

    if (after.priceCents !== before.priceCents) {
      await client.auditLog.create({
        data: {
          tenantId: this.requestContext.getTenantId(),
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'catalog.offer_price_update',
          entity: 'product_offer',
          beforeJson: { offerId: id, productId: before.productId, priceCents: before.priceCents },
          afterJson: { offerId: id, productId: after.productId, priceCents: after.priceCents },
          ip: actor.ip,
        },
      });
    }

    return after;
  }

  async setAvailable(
    id: string,
    expectedVersion: number,
    available: boolean,
  ): Promise<ProductOfferRecord> {
    const client = this.requestContext.getClient();
    const result = await client.productOffer.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { available, version: { increment: 1 } },
    });
    await assertOptimisticUpdate(
      'Oferta',
      result.count,
      async () => (await this.findById(id)) !== null,
    );
    return this.findByIdOrThrow(id);
  }

  private async findByIdOrThrow(id: string): Promise<ProductOfferRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Oferta');
    return record;
  }
}
