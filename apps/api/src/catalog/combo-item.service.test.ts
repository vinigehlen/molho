import { describe, expect, it } from 'vitest';
import { CatalogConflictError, CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  ComboItemRecord,
  ComboItemRepository,
  CreateComboItemInput,
  ProductKindLookup,
  UpdateComboItemInput,
} from './combo-item.repository';
import { ComboItemService } from './combo-item.service';

type Kind = ProductKindLookup['kind'];

class FakeComboItemRepository implements ComboItemRepository {
  rows = new Map<string, ComboItemRecord>();
  kinds = new Map<string, Kind>([
    ['combo-1', 'combo'],
    ['child-1', 'prepared'],
    ['child-2', 'industrialized'],
    ['combo-2', 'combo'],
  ]);
  names = new Map<string, string>([
    ['child-1', 'Xis'],
    ['child-2', 'Refri'],
  ]);
  private nextId = 1;

  async listByCombo(comboProductId: string): Promise<ComboItemRecord[]> {
    return [...this.rows.values()].filter((r) => r.comboProductId === comboProductId);
  }

  async findById(id: string): Promise<ComboItemRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async findProductKind(productId: string): Promise<ProductKindLookup | null> {
    const kind = this.kinds.get(productId);
    return kind ? { kind } : null;
  }

  async create(input: CreateComboItemInput): Promise<ComboItemRecord> {
    const dup = [...this.rows.values()].some(
      (r) => r.comboProductId === input.comboProductId && r.childProductId === input.childProductId,
    );
    if (dup) throw new CatalogValidationError('Este produto já faz parte do combo.');
    const record: ComboItemRecord = {
      id: `ci-${this.nextId++}`,
      comboProductId: input.comboProductId,
      childProductId: input.childProductId,
      childName: this.names.get(input.childProductId) ?? input.childProductId,
      quantity: input.quantity,
      sortOrder: input.sortOrder ?? 0,
      version: 0,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: string, expectedVersion: number, input: UpdateComboItemInput): Promise<ComboItemRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Item do combo');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Item do combo');
    const updated = { ...existing, ...input, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Item do combo');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Item do combo');
    this.rows.delete(id);
  }
}

function make() {
  const repo = new FakeComboItemRepository();
  return { repo, service: new ComboItemService(repo) };
}

describe('ComboItemService (combo fase 4.1a)', () => {
  it('adiciona um filho a um combo', async () => {
    const { service } = make();
    const item = await service.create({ comboProductId: 'combo-1', childProductId: 'child-1', quantity: 2 });
    expect(item).toMatchObject({ childName: 'Xis', quantity: 2 });
  });

  it('rejeita quando o pai não é um combo', async () => {
    const { service } = make();
    await expect(
      service.create({ comboProductId: 'child-1', childProductId: 'child-2', quantity: 1 }),
    ).rejects.toThrow(CatalogValidationError);
  });

  it('rejeita combo aninhado', async () => {
    const { service } = make();
    await expect(
      service.create({ comboProductId: 'combo-1', childProductId: 'combo-2', quantity: 1 }),
    ).rejects.toThrow(CatalogValidationError);
  });

  it('rejeita combo contendo ele mesmo', async () => {
    const { service } = make();
    await expect(
      service.create({ comboProductId: 'combo-1', childProductId: 'combo-1', quantity: 1 }),
    ).rejects.toThrow(CatalogValidationError);
  });

  it('rejeita filho inexistente', async () => {
    const { service } = make();
    await expect(
      service.create({ comboProductId: 'combo-1', childProductId: 'sumiu', quantity: 1 }),
    ).rejects.toThrow(CatalogNotFoundError);
  });

  it('rejeita filho duplicado no mesmo combo', async () => {
    const { service } = make();
    await service.create({ comboProductId: 'combo-1', childProductId: 'child-1', quantity: 1 });
    await expect(
      service.create({ comboProductId: 'combo-1', childProductId: 'child-1', quantity: 1 }),
    ).rejects.toThrow(CatalogValidationError);
  });

  it('atualiza quantidade sob optimistic lock', async () => {
    const { service } = make();
    const item = await service.create({ comboProductId: 'combo-1', childProductId: 'child-1', quantity: 1 });
    const updated = await service.update(item.id, 0, { quantity: 3 });
    expect(updated.quantity).toBe(3);
    await expect(service.update(item.id, 0, { quantity: 4 })).rejects.toThrow(CatalogConflictError);
  });
});
