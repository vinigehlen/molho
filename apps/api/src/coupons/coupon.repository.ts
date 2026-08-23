import type { CouponDiscountType } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import { CatalogNotFoundError } from '../catalog/catalog-errors';
import { assertOptimisticUpdate } from '../catalog/optimistic-update.util';

export interface CouponRecord {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountPercent: number | null;
  discountValueCents: number | null;
  minOrderCents: number;
  startsAt: Date;
  endsAt: Date;
  maxUses: number;
  usesCount: number;
  active: boolean;
  version: number;
}

export interface CreateCouponInput {
  code: string;
  discountType: CouponDiscountType;
  discountPercent?: number;
  discountValueCents?: number;
  minOrderCents: number;
  startsAt: Date;
  endsAt: Date;
  maxUses: number;
}

export interface UpdateCouponInput {
  active?: boolean;
  minOrderCents?: number;
  startsAt?: Date;
  endsAt?: Date;
  maxUses?: number;
}

export interface CouponRepository {
  list(): Promise<CouponRecord[]>;
  findById(id: string): Promise<CouponRecord | null>;
  /** `upper(code)` — mesma comparação do índice único parcial na migration. */
  codeTaken(code: string): Promise<boolean>;
  create(input: CreateCouponInput): Promise<CouponRecord>;
  update(id: string, expectedVersion: number, input: UpdateCouponInput): Promise<CouponRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  code: true,
  discountType: true,
  discountPercent: true,
  discountValueCents: true,
  minOrderCents: true,
  startsAt: true,
  endsAt: true,
  maxUses: true,
  usesCount: true,
  active: true,
  version: true,
} as const;

export class PrismaCouponRepository implements CouponRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async list(): Promise<CouponRecord[]> {
    return this.requestContext
      .getClient()
      .coupon.findMany({ where: { deletedAt: null }, select: SELECT, orderBy: { createdAt: 'desc' } });
  }

  async findById(id: string): Promise<CouponRecord | null> {
    return this.requestContext.getClient().coupon.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  }

  async codeTaken(code: string): Promise<boolean> {
    // `mode: 'insensitive'` casa a MESMA comparação do índice único parcial
    // (upper(code)) da migration — senão "PROMO10" e "promo10" pareceriam
    // livres um pro outro na aplicação mas colidiriam no banco (500 em vez
    // de 409 — CatalogConflictError nunca dispararia pra esse caso).
    const client = this.requestContext.getClient();
    const existing = await client.coupon.findFirst({
      where: { code: { equals: code, mode: 'insensitive' }, deletedAt: null },
      select: { id: true },
    });
    return existing !== null;
  }

  async create(input: CreateCouponInput): Promise<CouponRecord> {
    return this.requestContext.getClient().coupon.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        code: input.code,
        discountType: input.discountType,
        discountPercent: input.discountPercent ?? null,
        discountValueCents: input.discountValueCents ?? null,
        minOrderCents: input.minOrderCents,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        maxUses: input.maxUses,
      },
      select: SELECT,
    });
  }

  async update(id: string, expectedVersion: number, input: UpdateCouponInput): Promise<CouponRecord> {
    const client = this.requestContext.getClient();
    const result = await client.coupon.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Cupom', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.coupon.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Cupom', result.count, async () => (await this.findById(id)) !== null);
  }

  private async findByIdOrThrow(id: string): Promise<CouponRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Cupom');
    return record;
  }
}
