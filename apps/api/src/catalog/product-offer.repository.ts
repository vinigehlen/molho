import { Prisma } from '@molho/db';
import type { ComboPricingMode, ProductKind } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import type { CatalogActor } from './catalog-actor';
import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface ProductOfferRecord {
  id: string;
  productId: string;
  categoryId: string;
  priceCents: number;
  available: boolean;
  comboPricingMode: ComboPricingMode;
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
  comboPricingMode?: ComboPricingMode;
  pdvCode?: string | null;
  sortOrder?: number;
}

export interface CreateProductOfferInput {
  productId: string;
  categoryId: string;
  priceCents: number;
  available?: boolean;
  comboPricingMode?: ComboPricingMode;
  pdvCode?: string | null;
  sortOrder?: number;
}

export interface ProductOfferRepository {
  list(filter: ProductOfferFilter): Promise<ProductOfferRecord[]>;
  findById(id: string): Promise<ProductOfferRecord | null>;
  findProductKind(productId: string): Promise<ProductKind | null>;
  productExists(productId: string): Promise<boolean>;
  categoryExists(categoryId: string): Promise<boolean>;
  offerExists(productId: string, categoryId: string, excludingId?: string): Promise<boolean>;
  create(input: CreateProductOfferInput, actor: CatalogActor): Promise<ProductOfferRecord>;
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
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  productId: true,
  categoryId: true,
  priceCents: true,
  available: true,
  comboPricingMode: true,
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

  async findProductKind(productId: string): Promise<ProductKind | null> {
    const product = await this.requestContext.getClient().product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { kind: true },
    });
    return product?.kind ?? null;
  }

  async productExists(productId: string): Promise<boolean> {
    const product = await this.requestContext.getClient().product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    return product !== null;
  }

  async categoryExists(categoryId: string): Promise<boolean> {
    const category = await this.requestContext.getClient().category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    return category !== null;
  }

  async offerExists(productId: string, categoryId: string, excludingId?: string): Promise<boolean> {
    const offer = await this.requestContext.getClient().productOffer.findFirst({
      where: {
        productId,
        categoryId,
        deletedAt: null,
        ...(excludingId ? { id: { not: excludingId } } : {}),
      },
      select: { id: true },
    });
    return offer !== null;
  }

  async create(input: CreateProductOfferInput, actor: CatalogActor): Promise<ProductOfferRecord> {
    try {
      const client = this.requestContext.getClient();
      const created = await client.productOffer.create({
        data: {
          tenantId: this.requestContext.getTenantId(),
          productId: input.productId,
          categoryId: input.categoryId,
          priceCents: input.priceCents,
          available: input.available ?? true,
          comboPricingMode: input.comboPricingMode ?? 'fixed',
          pdvCode: input.pdvCode ?? null,
          sortOrder: input.sortOrder ?? 0,
          isPrimary: false,
        },
        select: SELECT,
      });
      await client.auditLog.create({
        data: {
          tenantId: this.requestContext.getTenantId(),
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'catalog.offer_create',
          entity: 'product_offer',
          afterJson: {
            offerId: created.id,
            productId: created.productId,
            categoryId: created.categoryId,
            priceCents: created.priceCents,
            available: created.available,
            comboPricingMode: created.comboPricingMode,
          },
          ip: actor.ip,
        },
      });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CatalogValidationError('Este produto já está disponível nesta categoria.');
      }
      throw error;
    }
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

    let result: { count: number };
    try {
      result = await client.productOffer.updateMany({
        where: { id, version: expectedVersion, deletedAt: null },
        data: { ...input, version: { increment: 1 } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CatalogValidationError('Este produto já está disponível nesta categoria.');
      }
      throw error;
    }
    await assertOptimisticUpdate(
      'Oferta',
      result.count,
      async () => (await this.findById(id)) !== null,
    );
    const after = await this.findByIdOrThrow(id);

    if (
      after.priceCents !== before.priceCents ||
      after.comboPricingMode !== before.comboPricingMode
    ) {
      await client.auditLog.create({
        data: {
          tenantId: this.requestContext.getTenantId(),
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'catalog.offer_price_update',
          entity: 'product_offer',
          beforeJson: {
            offerId: id,
            productId: before.productId,
            priceCents: before.priceCents,
            comboPricingMode: before.comboPricingMode,
          },
          afterJson: {
            offerId: id,
            productId: after.productId,
            priceCents: after.priceCents,
            comboPricingMode: after.comboPricingMode,
          },
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

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const result = await this.requestContext.getClient().productOffer.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate(
      'Oferta',
      result.count,
      async () => (await this.findById(id)) !== null,
    );
  }

  private async findByIdOrThrow(id: string): Promise<ProductOfferRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Oferta');
    return record;
  }
}
