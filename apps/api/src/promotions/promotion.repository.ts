import type { PromotionDiscountType, PromotionScope } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import { CatalogNotFoundError } from '../catalog/catalog-errors';
import { assertOptimisticUpdate } from '../catalog/optimistic-update.util';

export interface PromotionRecord {
  id: string;
  name: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  weekdays: number[];
  startTime: string;
  endTime: string;
  scope: PromotionScope;
  scopeId: string | null;
  active: boolean;
  version: number;
}

export interface CreatePromotionInput {
  name: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  weekdays: number[];
  startTime: string;
  endTime: string;
  scope: PromotionScope;
  scopeId?: string;
}

export interface UpdatePromotionInput {
  name?: string;
  active?: boolean;
  weekdays?: number[];
  startTime?: string;
  endTime?: string;
}

export interface PromotionRepository {
  list(): Promise<PromotionRecord[]>;
  findById(id: string): Promise<PromotionRecord | null>;
  /** Existência do alvo (produto ou categoria) NO MESMO TENANT — RLS já filtra, então "não achou" cobre tanto "não existe" quanto "é de outro tenant" (mesmo racional de CatalogNotFoundError). */
  targetExists(scope: 'category' | 'product', scopeId: string): Promise<boolean>;
  create(input: CreatePromotionInput): Promise<PromotionRecord>;
  update(id: string, expectedVersion: number, input: UpdatePromotionInput): Promise<PromotionRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  name: true,
  discountType: true,
  discountValue: true,
  weekdays: true,
  startTime: true,
  endTime: true,
  scope: true,
  scopeId: true,
  active: true,
  version: true,
} as const;

export class PrismaPromotionRepository implements PromotionRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async list(): Promise<PromotionRecord[]> {
    return this.requestContext
      .getClient()
      .promotion.findMany({ where: { deletedAt: null }, select: SELECT, orderBy: { createdAt: 'desc' } });
  }

  async findById(id: string): Promise<PromotionRecord | null> {
    return this.requestContext.getClient().promotion.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  }

  async targetExists(scope: 'category' | 'product', scopeId: string): Promise<boolean> {
    const client = this.requestContext.getClient();
    const record =
      scope === 'category'
        ? await client.category.findFirst({ where: { id: scopeId, deletedAt: null }, select: { id: true } })
        : await client.product.findFirst({ where: { id: scopeId, deletedAt: null }, select: { id: true } });
    return record !== null;
  }

  async create(input: CreatePromotionInput): Promise<PromotionRecord> {
    return this.requestContext.getClient().promotion.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        name: input.name,
        discountType: input.discountType,
        discountValue: input.discountValue,
        weekdays: input.weekdays,
        startTime: input.startTime,
        endTime: input.endTime,
        scope: input.scope,
        scopeId: input.scopeId ?? null,
      },
      select: SELECT,
    });
  }

  async update(id: string, expectedVersion: number, input: UpdatePromotionInput): Promise<PromotionRecord> {
    const client = this.requestContext.getClient();
    const result = await client.promotion.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Promoção', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.promotion.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Promoção', result.count, async () => (await this.findById(id)) !== null);
  }

  private async findByIdOrThrow(id: string): Promise<PromotionRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Promoção');
    return record;
  }
}
