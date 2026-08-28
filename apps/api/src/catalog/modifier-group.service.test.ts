import { describe, expect, it } from 'vitest';
import { CatalogConflictError, CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  CreateModifierGroupInput,
  ModifierGroupRecord,
  ModifierGroupRepository,
  ModifierGroupWithProductRecord,
  UpdateModifierGroupInput,
} from './modifier-group.repository';
import { ModifierGroupService } from './modifier-group.service';

class FakeModifierGroupRepository implements ModifierGroupRepository {
  rows = new Map<string, ModifierGroupRecord>();
  productIds = new Set<string>(['prod-1']);
  productNames = new Map<string, string>([['prod-1', 'Produto 1']]);
  private nextId = 1;

  async listByProduct(productId: string): Promise<ModifierGroupRecord[]> {
    return [...this.rows.values()].filter((r) => r.productId === productId);
  }

  async listAll(): Promise<ModifierGroupWithProductRecord[]> {
    return [...this.rows.values()].map((row) => ({
      ...row,
      productName: this.productNames.get(row.productId) ?? row.productId,
    }));
  }

  async findById(id: string): Promise<ModifierGroupRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async productExists(productId: string): Promise<boolean> {
    return this.productIds.has(productId);
  }

  async create(input: CreateModifierGroupInput): Promise<ModifierGroupRecord> {
    const record: ModifierGroupRecord = {
      id: `mg-${this.nextId++}`,
      productId: input.productId,
      name: input.name,
      min: input.min ?? 0,
      max: input.max ?? 1,
      active: true,
      pdvCode: input.pdvCode ?? null,
      version: 0,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateModifierGroupInput,
  ): Promise<ModifierGroupRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Grupo de complementos');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Grupo de complementos');
    const updated = { ...existing, ...input, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Grupo de complementos');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Grupo de complementos');
    this.rows.delete(id);
  }
}

function setup() {
  const repo = new FakeModifierGroupRepository();
  return { repo, service: new ModifierGroupService(repo) };
}

describe('ModifierGroupService', () => {
  it('1) create() delega quando o produto existe e min<=max', async () => {
    const { service } = setup();
    const created = await service.create({ productId: 'prod-1', name: 'Ponto da carne', min: 1, max: 1 });
    expect(created.min).toBe(1);
    expect(created.max).toBe(1);
  });

  it('2) create() rejeita produto inexistente', async () => {
    const { service, repo } = setup();
    await expect(
      service.create({ productId: 'prod-inexistente', name: 'Adicionais', min: 0, max: 3 }),
    ).rejects.toThrow(CatalogNotFoundError);
    expect(repo.rows.size).toBe(0);
  });

  it('3) create() rejeita min > max', async () => {
    const { service } = setup();
    await expect(service.create({ productId: 'prod-1', name: 'Adicionais', min: 3, max: 1 })).rejects.toThrow(
      CatalogValidationError,
    );
  });

  it('4) create() rejeita min negativo', async () => {
    const { service } = setup();
    await expect(service.create({ productId: 'prod-1', name: 'Adicionais', min: -1, max: 1 })).rejects.toThrow(
      CatalogValidationError,
    );
  });

  it('5) update() só min, validado contra o max ATUAL do registro', async () => {
    const { service } = setup();
    const created = await service.create({ productId: 'prod-1', name: 'Adicionais', min: 0, max: 2 });
    await expect(service.update(created.id, created.version, { min: 3 })).rejects.toThrow(CatalogValidationError);

    const updated = await service.update(created.id, created.version, { min: 1 });
    expect(updated.min).toBe(1);
    expect(updated.max).toBe(2);
  });

  it('6) update() com version desatualizada propaga CatalogConflictError', async () => {
    const { service } = setup();
    const created = await service.create({ productId: 'prod-1', name: 'Adicionais', min: 0, max: 2 });
    await expect(service.update(created.id, created.version + 1, { name: 'X' })).rejects.toThrow(
      CatalogConflictError,
    );
  });

  it('7) delete() remove do repositório', async () => {
    const { service, repo } = setup();
    const created = await service.create({ productId: 'prod-1', name: 'Adicionais', min: 0, max: 2 });
    await service.delete(created.id, created.version);
    expect(repo.rows.has(created.id)).toBe(false);
  });

  it('8) listAll() (aba Complementos) devolve grupos de TODOS os produtos, com nome do produto dono', async () => {
    const { service, repo } = setup();
    repo.productIds.add('prod-2');
    repo.productNames.set('prod-2', 'Produto 2');
    await service.create({ productId: 'prod-1', name: 'Tamanho', min: 1, max: 1 });
    await service.create({ productId: 'prod-2', name: 'Ponto da carne', min: 1, max: 1 });

    const all = await service.listAll();

    expect(all).toHaveLength(2);
    expect(all.find((g) => g.name === 'Tamanho')?.productName).toBe('Produto 1');
    expect(all.find((g) => g.name === 'Ponto da carne')?.productName).toBe('Produto 2');
  });

  it('9) create() nasce ativo por padrão; update() pausa (active:false) sem apagar', async () => {
    const { service, repo } = setup();
    const created = await service.create({ productId: 'prod-1', name: 'Adicionais', min: 0, max: 2 });
    expect(created.active).toBe(true);

    const paused = await service.update(created.id, created.version, { active: false });

    expect(paused.active).toBe(false);
    expect(repo.rows.has(created.id)).toBe(true);
  });
});
