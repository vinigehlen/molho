import { Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface ComboItemRecord {
  id: string;
  comboProductId: string;
  childProductId: string;
  childName: string;
  quantity: number;
  sortOrder: number;
  version: number;
}

export interface CreateComboItemInput {
  comboProductId: string;
  childProductId: string;
  quantity: number;
  sortOrder?: number;
}

export interface UpdateComboItemInput {
  quantity?: number;
  sortOrder?: number;
}

/** `kind` cru do produto — só o que o service precisa pra validar composição. */
export interface ProductKindLookup {
  kind: 'prepared' | 'industrialized' | 'combo';
}

export interface ComboItemRepository {
  listByCombo(comboProductId: string): Promise<ComboItemRecord[]>;
  findById(id: string): Promise<ComboItemRecord | null>;
  findProductKind(productId: string): Promise<ProductKindLookup | null>;
  create(input: CreateComboItemInput): Promise<ComboItemRecord>;
  update(id: string, expectedVersion: number, input: UpdateComboItemInput): Promise<ComboItemRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  comboProductId: true,
  childProductId: true,
  quantity: true,
  sortOrder: true,
  version: true,
  childProduct: { select: { name: true } },
} as const;

function toRecord(row: {
  id: string;
  comboProductId: string;
  childProductId: string;
  quantity: number;
  sortOrder: number;
  version: number;
  childProduct: { name: string };
}): ComboItemRecord {
  return {
    id: row.id,
    comboProductId: row.comboProductId,
    childProductId: row.childProductId,
    childName: row.childProduct.name,
    quantity: row.quantity,
    sortOrder: row.sortOrder,
    version: row.version,
  };
}

export class PrismaComboItemRepository implements ComboItemRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async listByCombo(comboProductId: string): Promise<ComboItemRecord[]> {
    const rows = await this.requestContext.getClient().comboItem.findMany({
      where: { comboProductId, deletedAt: null, childProduct: { deletedAt: null } },
      select: SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<ComboItemRecord | null> {
    const row = await this.requestContext
      .getClient()
      .comboItem.findFirst({ where: { id, deletedAt: null }, select: SELECT });
    return row ? toRecord(row) : null;
  }

  async findProductKind(productId: string): Promise<ProductKindLookup | null> {
    return this.requestContext
      .getClient()
      .product.findFirst({ where: { id: productId, deletedAt: null }, select: { kind: true } });
  }

  async create(input: CreateComboItemInput): Promise<ComboItemRecord> {
    try {
      const row = await this.requestContext.getClient().comboItem.create({
        data: {
          tenantId: this.requestContext.getTenantId(),
          comboProductId: input.comboProductId,
          childProductId: input.childProductId,
          quantity: input.quantity,
          sortOrder: input.sortOrder ?? 0,
        },
        select: SELECT,
      });
      return toRecord(row);
    } catch (error) {
      // Índice único parcial (combo_product_id, child_product_id) — o mesmo
      // produto já está neste combo.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CatalogValidationError('Este produto já faz parte do combo.');
      }
      throw error;
    }
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateComboItemInput,
  ): Promise<ComboItemRecord> {
    const client = this.requestContext.getClient();
    const result = await client.comboItem.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Item do combo', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.comboItem.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Item do combo', result.count, async () => (await this.findById(id)) !== null);
  }

  private async findByIdOrThrow(id: string): Promise<ComboItemRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Item do combo');
    return record;
  }
}
