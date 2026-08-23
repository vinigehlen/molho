import { describe, expect, it } from 'vitest';
import { CatalogConflictError, CatalogNotFoundError, CatalogValidationError } from '../catalog/catalog-errors';
import type { CouponRecord, CouponRepository, CreateCouponInput, UpdateCouponInput } from './coupon.repository';
import { CouponService } from './coupon.service';

const STARTS = new Date('2026-09-01T00:00:00Z');
const ENDS = new Date('2026-09-30T23:59:59Z');

function baseInput(overrides: Partial<CreateCouponInput> = {}): CreateCouponInput {
  return {
    code: 'PROMO10',
    discountType: 'percent',
    discountPercent: 10,
    minOrderCents: 0,
    startsAt: STARTS,
    endsAt: ENDS,
    maxUses: 100,
    ...overrides,
  };
}

class FakeCouponRepository implements CouponRepository {
  rows = new Map<string, CouponRecord>();
  private nextId = 1;

  async list(): Promise<CouponRecord[]> {
    return [...this.rows.values()];
  }

  async findById(id: string): Promise<CouponRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async codeTaken(code: string): Promise<boolean> {
    return [...this.rows.values()].some((r) => r.code.toUpperCase() === code.toUpperCase());
  }

  async create(input: CreateCouponInput): Promise<CouponRecord> {
    const record: CouponRecord = {
      id: `cp-${this.nextId++}`,
      code: input.code,
      discountType: input.discountType,
      discountPercent: input.discountPercent ?? null,
      discountValueCents: input.discountValueCents ?? null,
      minOrderCents: input.minOrderCents,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      maxUses: input.maxUses,
      usesCount: 0,
      active: true,
      version: 0,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: string, expectedVersion: number, input: UpdateCouponInput): Promise<CouponRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Cupom');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Cupom');
    const updated = { ...existing, ...input, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Cupom');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Cupom');
    this.rows.delete(id);
  }
}

function setup() {
  const repo = new FakeCouponRepository();
  return { repo, service: new CouponService(repo) };
}

describe('CouponService', () => {
  it('1) create() aceita percent com discountPercent', async () => {
    const { service } = setup();
    const created = await service.create(baseInput());
    expect(created.discountPercent).toBe(10);
    expect(created.discountValueCents).toBeNull();
  });

  it('2) create() aceita fixed com discountValueCents', async () => {
    const { service } = setup();
    const created = await service.create(
      baseInput({ discountType: 'fixed', discountPercent: undefined, discountValueCents: 500 }),
    );
    expect(created.discountValueCents).toBe(500);
    expect(created.discountPercent).toBeNull();
  });

  it('3) create() rejeita percent sem discountPercent', async () => {
    const { service } = setup();
    await expect(service.create(baseInput({ discountPercent: undefined }))).rejects.toThrow(CatalogValidationError);
  });

  it('4) create() rejeita fixed sem discountValueCents', async () => {
    const { service } = setup();
    await expect(service.create(baseInput({ discountType: 'fixed', discountPercent: undefined }))).rejects.toThrow(
      CatalogValidationError,
    );
  });

  it('4b) create() rejeita fixed com discountPercent TAMBÉM setado (XOR de verdade, não só "tem o certo")', async () => {
    const { service } = setup();
    await expect(
      service.create(baseInput({ discountType: 'fixed', discountValueCents: 500, discountPercent: 10 })),
    ).rejects.toThrow(CatalogValidationError);
  });

  it('5) create() rejeita startsAt >= endsAt', async () => {
    const { service } = setup();
    await expect(service.create(baseInput({ startsAt: ENDS, endsAt: STARTS }))).rejects.toThrow(
      CatalogValidationError,
    );
  });

  it('6) create() rejeita maxUses < 1', async () => {
    const { service } = setup();
    await expect(service.create(baseInput({ maxUses: 0 }))).rejects.toThrow(CatalogValidationError);
  });

  it('7) create() rejeita código já usado (case-insensitive) — 409, não 500', async () => {
    const { service } = setup();
    await service.create(baseInput({ code: 'PROMO10' }));
    await expect(service.create(baseInput({ code: 'promo10' }))).rejects.toThrow(CatalogConflictError);
  });

  it('8) update() com version desatualizada propaga CatalogConflictError', async () => {
    const { service } = setup();
    const created = await service.create(baseInput());
    await expect(service.update(created.id, created.version + 1, { active: false })).rejects.toThrow(
      CatalogConflictError,
    );
  });

  it('9) update() desativa o cupom', async () => {
    const { service } = setup();
    const created = await service.create(baseInput());
    const updated = await service.update(created.id, created.version, { active: false });
    expect(updated.active).toBe(false);
  });

  it('10) delete() remove do repositório', async () => {
    const { service, repo } = setup();
    const created = await service.create(baseInput());
    await service.delete(created.id, created.version);
    expect(repo.rows.has(created.id)).toBe(false);
  });
});
