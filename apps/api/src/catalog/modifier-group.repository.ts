import type { RequestContextService } from '../context/request-context.service';
import { CatalogNotFoundError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface ModifierGroupRecord {
  id: string;
  productId: string;
  name: string;
  min: number;
  max: number;
  version: number;
}

export interface CreateModifierGroupInput {
  productId: string;
  name: string;
  min?: number;
  max?: number;
}

export interface UpdateModifierGroupInput {
  name?: string;
  min?: number;
  max?: number;
}

export interface ModifierGroupRepository {
  listByProduct(productId: string): Promise<ModifierGroupRecord[]>;
  findById(id: string): Promise<ModifierGroupRecord | null>;
  productExists(productId: string): Promise<boolean>;
  create(input: CreateModifierGroupInput): Promise<ModifierGroupRecord>;
  update(id: string, expectedVersion: number, input: UpdateModifierGroupInput): Promise<ModifierGroupRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  productId: true,
  name: true,
  min: true,
  max: true,
  version: true,
} as const;

export class PrismaModifierGroupRepository implements ModifierGroupRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async listByProduct(productId: string): Promise<ModifierGroupRecord[]> {
    return this.requestContext
      .getClient()
      .modifierGroup.findMany({ where: { productId, deletedAt: null }, select: SELECT });
  }

  async findById(id: string): Promise<ModifierGroupRecord | null> {
    return this.requestContext
      .getClient()
      .modifierGroup.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  }

  async productExists(productId: string): Promise<boolean> {
    const product = await this.requestContext
      .getClient()
      .product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true } });
    return product !== null;
  }

  async create(input: CreateModifierGroupInput): Promise<ModifierGroupRecord> {
    return this.requestContext.getClient().modifierGroup.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        productId: input.productId,
        name: input.name,
        min: input.min ?? 0,
        max: input.max ?? 1,
      },
      select: SELECT,
    });
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateModifierGroupInput,
  ): Promise<ModifierGroupRecord> {
    const client = this.requestContext.getClient();
    const result = await client.modifierGroup.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Grupo de complementos', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.modifierGroup.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Grupo de complementos', result.count, async () => (await this.findById(id)) !== null);
  }

  private async findByIdOrThrow(id: string): Promise<ModifierGroupRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Grupo de complementos');
    return record;
  }
}
