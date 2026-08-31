import type { RequestContextService } from '../context/request-context.service';
import { CatalogNotFoundError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface ModifierRecord {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  priceDeltaCents: number;
  active: boolean;
  pdvCode: string | null;
  sortOrder: number;
  version: number;
}

export interface CreateModifierInput {
  groupId: string;
  name: string;
  description?: string | null;
  imageKey?: string | null;
  priceDeltaCents: number;
  active?: boolean;
  pdvCode?: string | null;
  sortOrder?: number;
}

export interface UpdateModifierInput {
  name?: string;
  description?: string | null;
  imageKey?: string | null;
  priceDeltaCents?: number;
  active?: boolean;
  pdvCode?: string | null;
  sortOrder?: number;
}

export interface ModifierRepository {
  listByGroup(groupId: string): Promise<ModifierRecord[]>;
  findById(id: string): Promise<ModifierRecord | null>;
  groupExists(groupId: string): Promise<boolean>;
  maxSortOrder(groupId: string): Promise<number>;
  create(input: CreateModifierInput): Promise<ModifierRecord>;
  update(id: string, expectedVersion: number, input: UpdateModifierInput): Promise<ModifierRecord>;
  reorder(groupId: string, items: Array<{ id: string; version: number }>): Promise<ModifierRecord[]>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  groupId: true,
  name: true,
  description: true,
  imageKey: true,
  priceDeltaCents: true,
  active: true,
  pdvCode: true,
  sortOrder: true,
  version: true,
} as const;

export class PrismaModifierRepository implements ModifierRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async listByGroup(groupId: string): Promise<ModifierRecord[]> {
    return this.requestContext.getClient().modifier.findMany({
      where: { groupId, deletedAt: null },
      select: SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string): Promise<ModifierRecord | null> {
    return this.requestContext.getClient().modifier.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  }

  async groupExists(groupId: string): Promise<boolean> {
    const group = await this.requestContext
      .getClient()
      .modifierGroup.findFirst({ where: { id: groupId, deletedAt: null }, select: { id: true } });
    return group !== null;
  }

  async maxSortOrder(groupId: string): Promise<number> {
    const top = await this.requestContext.getClient().modifier.findFirst({
      where: { groupId, deletedAt: null },
      select: { sortOrder: true },
      orderBy: { sortOrder: 'desc' },
    });
    return top?.sortOrder ?? -1;
  }

  async create(input: CreateModifierInput): Promise<ModifierRecord> {
    return this.requestContext.getClient().modifier.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        groupId: input.groupId,
        name: input.name,
        description: input.description ?? null,
        imageKey: input.imageKey ?? null,
        priceDeltaCents: input.priceDeltaCents,
        active: input.active ?? true,
        pdvCode: input.pdvCode ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
      select: SELECT,
    });
  }

  async update(id: string, expectedVersion: number, input: UpdateModifierInput): Promise<ModifierRecord> {
    const client = this.requestContext.getClient();
    const result = await client.modifier.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Complemento', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async reorder(groupId: string, items: Array<{ id: string; version: number }>): Promise<ModifierRecord[]> {
    const client = this.requestContext.getClient();
    for (const [sortOrder, item] of items.entries()) {
      const result = await client.modifier.updateMany({
        where: { id: item.id, groupId, version: item.version, deletedAt: null },
        data: { sortOrder, version: { increment: 1 } },
      });
      await assertOptimisticUpdate('Complemento', result.count, async () => (await this.findById(item.id)) !== null);
    }
    return this.listByGroup(groupId);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.modifier.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Complemento', result.count, async () => (await this.findById(id)) !== null);
  }

  private async findByIdOrThrow(id: string): Promise<ModifierRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Complemento');
    return record;
  }
}
