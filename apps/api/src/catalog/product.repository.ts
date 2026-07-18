import type { RequestContextService } from '../context/request-context.service';
import { CatalogNotFoundError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface ProductRecord {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  imageKey: string | null;
  available: boolean;
  sortOrder: number;
  version: number;
}

export interface CreateProductInput {
  categoryId: string;
  name: string;
  description?: string;
  basePriceCents: number;
  sortOrder?: number;
}

export interface UpdateProductInput {
  categoryId?: string;
  name?: string;
  description?: string | null;
  basePriceCents?: number;
  sortOrder?: number;
}

export interface ProductRepository {
  listByCategory(categoryId: string): Promise<ProductRecord[]>;
  findById(id: string): Promise<ProductRecord | null>;
  categoryExists(categoryId: string): Promise<boolean>;
  create(input: CreateProductInput): Promise<ProductRecord>;
  update(id: string, expectedVersion: number, input: UpdateProductInput): Promise<ProductRecord>;
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
    return this.requestContext.getClient().product.findFirst({ where: { id, deletedAt: null }, select: SELECT });
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

  async create(input: CreateProductInput): Promise<ProductRecord> {
    return this.requestContext.getClient().product.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        basePriceCents: input.basePriceCents,
        sortOrder: input.sortOrder ?? 0,
      },
      select: SELECT,
    });
  }

  async update(id: string, expectedVersion: number, input: UpdateProductInput): Promise<ProductRecord> {
    const client = this.requestContext.getClient();
    const result = await client.product.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Produto', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async setAvailable(id: string, expectedVersion: number, available: boolean): Promise<ProductRecord> {
    const client = this.requestContext.getClient();
    const result = await client.product.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { available, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Produto', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.product.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Produto', result.count, async () => (await this.findById(id)) !== null);
  }

  private async findByIdOrThrow(id: string): Promise<ProductRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Produto');
    return record;
  }
}
