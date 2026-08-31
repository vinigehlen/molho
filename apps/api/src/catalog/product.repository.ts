import type { ProductKind } from '@molho/contracts';
import { Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import type { CatalogActor } from './catalog-actor';
import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface ProductRecord {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  imageKey: string | null;
  available: boolean;
  /** Código do item no PDV do lojista — texto livre opcional, nunca
   * interpretado por nós (exceção MVP 2026-08-28, CLAUDE.md). */
  pdvCode: string | null;
  /** Natureza do item (exceção MVP 2026-08-28, CLAUDE.md — fase 3 do combo). */
  kind: ProductKind;
  sortOrder: number;
  version: number;
}

export interface CreateProductInput {
  categoryId: string;
  name: string;
  description?: string;
  basePriceCents: number;
  pdvCode?: string | null;
  kind?: ProductKind;
  sortOrder?: number;
}

export interface UpdateProductInput {
  categoryId?: string;
  name?: string;
  description?: string | null;
  basePriceCents?: number;
  pdvCode?: string | null;
  kind?: ProductKind;
  sortOrder?: number;
  /** Confirma o upload feito via presigned PUT (StorageProvider) — nunca gerado a partir de input livre do cliente. */
  imageKey?: string;
}

export interface ProductRepository {
  listByCategory(categoryId: string): Promise<ProductRecord[]>;
  findById(id: string): Promise<ProductRecord | null>;
  categoryExists(categoryId: string): Promise<boolean>;
  secondaryOfferExists(productId: string, categoryId: string): Promise<boolean>;
  create(input: CreateProductInput): Promise<ProductRecord>;
  update(
    id: string,
    expectedVersion: number,
    input: UpdateProductInput,
    actor: CatalogActor,
  ): Promise<ProductRecord>;
  /** "Esgotado manual" (definicoes-v1 §5.4) — nunca passa pelo update() genérico, ver ProductService. */
  setAvailable(id: string, expectedVersion: number, available: boolean): Promise<ProductRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  basePriceCents: true,
  imageKey: true,
  available: true,
  pdvCode: true,
  kind: true,
  sortOrder: true,
  version: true,
} as const;

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async listByCategory(categoryId: string): Promise<ProductRecord[]> {
    return this.requestContext.getClient().product.findMany({
      where: { categoryId, deletedAt: null },
      select: SELECT,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findById(id: string): Promise<ProductRecord | null> {
    return this.requestContext
      .getClient()
      .product.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  }

  /**
   * RLS já garante que uma categoria de outro tenant nunca aparece aqui —
   * este findFirst é o mesmo tipo de leitura de qualquer outro método deste
   * repositório, só que na tabela pai. A FK composta (category_id,
   * tenant_id) no banco é a defesa de verdade (ver migration do commit 2);
   * este check só existe pra devolver um 404 legível em vez de deixar o
   * INSERT estourar a constraint.
   */
  async categoryExists(categoryId: string): Promise<boolean> {
    const category = await this.requestContext
      .getClient()
      .category.findFirst({ where: { id: categoryId, deletedAt: null }, select: { id: true } });
    return category !== null;
  }

  async secondaryOfferExists(productId: string, categoryId: string): Promise<boolean> {
    const offer = await this.requestContext.getClient().productOffer.findFirst({
      where: { productId, categoryId, isPrimary: false, deletedAt: null },
      select: { id: true },
    });
    return offer !== null;
  }

  async create(input: CreateProductInput): Promise<ProductRecord> {
    return this.requestContext.getClient().product.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        basePriceCents: input.basePriceCents,
        pdvCode: input.pdvCode ?? null,
        kind: input.kind ?? 'prepared',
        sortOrder: input.sortOrder ?? 0,
      },
      select: SELECT,
    });
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateProductInput,
    actor: CatalogActor,
  ): Promise<ProductRecord> {
    const client = this.requestContext.getClient();
    const before = await this.findById(id);
    if (!before) throw new CatalogNotFoundError('Produto');
    let result: { count: number };
    try {
      result = await client.product.updateMany({
        where: { id, version: expectedVersion, deletedAt: null },
        data: { ...input, version: { increment: 1 } },
      });
    } catch (error) {
      // A trigger legado → oferta pode perder a corrida contra a criação de
      // uma secundária na categoria de destino. O índice parcial fecha a
      // consistência; esta tradução preserva o contrato HTTP legível.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CatalogValidationError('Este produto já está disponível nesta categoria.');
      }
      throw error;
    }
    await assertOptimisticUpdate(
      'Produto',
      result.count,
      async () => (await this.findById(id)) !== null,
    );
    const after = await this.findByIdOrThrow(id);

    // Endpoint legado continua vivo durante a expansão. A trigger já
    // sincronizou a oferta primária; a auditoria usa a mesma ação/entidade da
    // API nova para não fragmentar o histórico de mudança de preço.
    if (after.basePriceCents !== before.basePriceCents) {
      const primaryOffer = await client.productOffer.findFirst({
        where: { productId: id, isPrimary: true, deletedAt: null },
        select: { id: true },
      });
      await client.auditLog.create({
        data: {
          tenantId: this.requestContext.getTenantId(),
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'catalog.offer_price_update',
          entity: 'product_offer',
          beforeJson: {
            offerId: primaryOffer?.id ?? null,
            productId: id,
            priceCents: before.basePriceCents,
          },
          afterJson: {
            offerId: primaryOffer?.id ?? null,
            productId: id,
            priceCents: after.basePriceCents,
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
  ): Promise<ProductRecord> {
    const client = this.requestContext.getClient();
    const result = await client.product.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { available, version: { increment: 1 } },
    });
    await assertOptimisticUpdate(
      'Produto',
      result.count,
      async () => (await this.findById(id)) !== null,
    );
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.product.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate(
      'Produto',
      result.count,
      async () => (await this.findById(id)) !== null,
    );
  }

  private async findByIdOrThrow(id: string): Promise<ProductRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Produto');
    return record;
  }
}
