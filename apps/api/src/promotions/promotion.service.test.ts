import { describe, expect, it } from 'vitest';
import { CatalogConflictError, CatalogNotFoundError, CatalogValidationError } from '../catalog/catalog-errors';
import type { CreatePromotionInput, PromotionRecord, PromotionRepository, UpdatePromotionInput } from './promotion.repository';
import { PromotionService } from './promotion.service';

function baseInput(overrides: Partial<CreatePromotionInput> = {}): CreatePromotionInput {
  return {
    name: '10% na loja toda',
    discountType: 'percent',
    discountValue: 10,
    weekdays: [1, 2, 3, 4, 5],
    startTime: '18:00',
    endTime: '22:00',
    scope: 'store_wide',
    ...overrides,
  };
}

class FakePromotionRepository implements PromotionRepository {
  rows = new Map<string, PromotionRecord>();
  existingTargets = new Set<string>();
  private nextId = 1;

  async list(): Promise<PromotionRecord[]> {
    return [...this.rows.values()];
  }

  async findById(id: string): Promise<PromotionRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async targetExists(scope: 'category' | 'product', scopeId: string): Promise<boolean> {
    return this.existingTargets.has(`${scope}:${scopeId}`);
  }

  async create(input: CreatePromotionInput): Promise<PromotionRecord> {
    const record: PromotionRecord = {
      id: `pr-${this.nextId++}`,
      name: input.name,
      discountType: input.discountType,
      discountValue: input.discountValue,
      weekdays: input.weekdays,
      startTime: input.startTime,
      endTime: input.endTime,
      scope: input.scope,
      scopeId: input.scopeId ?? null,
      active: true,
      version: 0,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: string, expectedVersion: number, input: UpdatePromotionInput): Promise<PromotionRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Promoção');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Promoção');
    const updated = { ...existing, ...input, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Promoção');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Promoção');
    this.rows.delete(id);
  }
}

function setup() {
  const repo = new FakePromotionRepository();
  return { repo, service: new PromotionService(repo) };
}

describe('PromotionService', () => {
  it('1) create() aceita store_wide sem scopeId', async () => {
    const { service } = setup();
    const created = await service.create(baseInput());
    expect(created.scope).toBe('store_wide');
    expect(created.scopeId).toBeNull();
  });

  it('2) create() rejeita scope category/product sem scopeId', async () => {
    const { service } = setup();
    await expect(service.create(baseInput({ scope: 'category' }))).rejects.toThrow(CatalogValidationError);
  });

  it('3) create() rejeita scopeId de categoria que não existe (ou é de outro tenant — RLS já filtra)', async () => {
    const { service } = setup();
    await expect(
      service.create(baseInput({ scope: 'category', scopeId: 'cat-sumiu' })),
    ).rejects.toThrow(CatalogNotFoundError);
  });

  it('4) create() aceita scope product com scopeId existente', async () => {
    const { repo, service } = setup();
    repo.existingTargets.add('product:prod-1');
    const created = await service.create(baseInput({ scope: 'product', scopeId: 'prod-1' }));
    expect(created.scope).toBe('product');
    expect(created.scopeId).toBe('prod-1');
  });

  it('5) create() rejeita weekdays vazio', async () => {
    const { service } = setup();
    await expect(service.create(baseInput({ weekdays: [] }))).rejects.toThrow(CatalogValidationError);
  });

  it('6) create() rejeita startTime === endTime (janela vazia)', async () => {
    const { service } = setup();
    await expect(service.create(baseInput({ startTime: '18:00', endTime: '18:00' }))).rejects.toThrow(
      CatalogValidationError,
    );
  });

  it('7) update() com version desatualizada propaga CatalogConflictError', async () => {
    const { service } = setup();
    const created = await service.create(baseInput());
    await expect(service.update(created.id, created.version + 1, { active: false })).rejects.toThrow(
      CatalogConflictError,
    );
  });

  it('8) update() revalida a janela quando weekdays muda pra vazio', async () => {
    const { service } = setup();
    const created = await service.create(baseInput());
    await expect(service.update(created.id, created.version, { weekdays: [] })).rejects.toThrow(
      CatalogValidationError,
    );
  });

  it('9) update() sem mexer em janela/dias não revalida (não busca o registro à toa)', async () => {
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
