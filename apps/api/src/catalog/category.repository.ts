import type { RequestContextService } from '../context/request-context.service';
import { CatalogNotFoundError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface CategoryRecord {
  id: string;
  name: string;
  sortOrder: number;
  visible: boolean;
  version: number;
}

export interface CreateCategoryInput {
  name: string;
  sortOrder?: number;
  visible?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  sortOrder?: number;
  visible?: boolean;
}

export interface CategoryRepository {
  list(): Promise<CategoryRecord[]>;
  findById(id: string): Promise<CategoryRecord | null>;
  /** Casamento case-insensitive — usado pela importação por planilha pra achar/criar categoria por nome. */
  findByName(name: string): Promise<CategoryRecord | null>;
  create(input: CreateCategoryInput): Promise<CategoryRecord>;
  update(id: string, expectedVersion: number, input: UpdateCategoryInput): Promise<CategoryRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  visible: true,
  version: true,
} as const;

/**
 * tenant_id nunca é parâmetro de método: RLS (app_tenant_visible) já filtra
 * toda leitura pelo tenant do GUC da transação, e create() lê o tenant do
 * próprio RequestContextService — nunca confia em input externo pra isso.
 */
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async list(): Promise<CategoryRecord[]> {
    return this.requestContext
      .getClient()
      .category.findMany({ where: { deletedAt: null }, select: SELECT, orderBy: { sortOrder: 'asc' } });
  }

  async findById(id: string): Promise<CategoryRecord | null> {
    return this.requestContext.getClient().category.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  }

  async findByName(name: string): Promise<CategoryRecord | null> {
    return this.requestContext.getClient().category.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' }, deletedAt: null },
      select: SELECT,
    });
  }

  async create(input: CreateCategoryInput): Promise<CategoryRecord> {
    return this.requestContext.getClient().category.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        visible: input.visible ?? true,
      },
      select: SELECT,
    });
  }

  async update(id: string, expectedVersion: number, input: UpdateCategoryInput): Promise<CategoryRecord> {
    const client = this.requestContext.getClient();
    const result = await client.category.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Categoria', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.category.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Categoria', result.count, async () => (await this.findById(id)) !== null);
  }

  private async findByIdOrThrow(id: string): Promise<CategoryRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Categoria');
    return record;
  }
}
