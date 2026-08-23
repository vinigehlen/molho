import type { RequestContextService } from '../context/request-context.service';
import { CatalogNotFoundError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface ProductImageRecord {
  id: string;
  productId: string;
  imageKey: string;
  position: number;
  version: number;
}

export interface CreateProductImageInput {
  productId: string;
  imageKey: string;
  /** Sem valor: entra no fim da galeria (ver ProductImageService.create). */
  position: number;
}

export interface UpdateProductImageInput {
  position?: number;
}

export interface ProductImageRepository {
  listByProduct(productId: string): Promise<ProductImageRecord[]>;
  findById(id: string): Promise<ProductImageRecord | null>;
  productExists(productId: string): Promise<boolean>;
  /** Maior `position` viva do produto, ou -1 se a galeria estiver vazia (próxima foto entra em 0). */
  maxPosition(productId: string): Promise<number>;
  create(input: CreateProductImageInput): Promise<ProductImageRecord>;
  update(id: string, expectedVersion: number, input: UpdateProductImageInput): Promise<ProductImageRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  productId: true,
  imageKey: true,
  position: true,
  version: true,
} as const;

export class PrismaProductImageRepository implements ProductImageRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async listByProduct(productId: string): Promise<ProductImageRecord[]> {
    return this.requestContext
      .getClient()
      .productImage.findMany({ where: { productId, deletedAt: null }, select: SELECT, orderBy: { position: 'asc' } });
  }

  async findById(id: string): Promise<ProductImageRecord | null> {
    return this.requestContext.getClient().productImage.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  }

  async productExists(productId: string): Promise<boolean> {
    const product = await this.requestContext
      .getClient()
      .product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true } });
    return product !== null;
  }

  async maxPosition(productId: string): Promise<number> {
    const top = await this.requestContext.getClient().productImage.findFirst({
      where: { productId, deletedAt: null },
      select: { position: true },
      orderBy: { position: 'desc' },
    });
    return top?.position ?? -1;
  }

  async create(input: CreateProductImageInput): Promise<ProductImageRecord> {
    return this.requestContext.getClient().productImage.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        productId: input.productId,
        imageKey: input.imageKey,
        position: input.position,
      },
      select: SELECT,
    });
  }

  async update(id: string, expectedVersion: number, input: UpdateProductImageInput): Promise<ProductImageRecord> {
    const client = this.requestContext.getClient();
    const result = await client.productImage.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Foto do produto', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.productImage.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Foto do produto', result.count, async () => (await this.findById(id)) !== null);
  }

  private async findByIdOrThrow(id: string): Promise<ProductImageRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Foto do produto');
    return record;
  }
}
