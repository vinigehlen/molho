import { describe, expect, it } from 'vitest';
import type { CategoryRecord, CategoryRepository, CreateCategoryInput, UpdateCategoryInput } from './category.repository';
import { CategoryService } from './category.service';
import { CatalogConflictError, CatalogNotFoundError, CatalogValidationError } from './catalog-errors';

class FakeCategoryRepository implements CategoryRepository {
  rows = new Map<string, CategoryRecord>();
  private nextId = 1;

  async list(): Promise<CategoryRecord[]> {
    return [...this.rows.values()];
  }

  async findById(id: string): Promise<CategoryRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async create(input: CreateCategoryInput): Promise<CategoryRecord> {
    const record: CategoryRecord = {
      id: `cat-${this.nextId++}`,
      name: input.name,
      sortOrder: input.sortOrder ?? 0,
      visible: input.visible ?? true,
      version: 0,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: string, expectedVersion: number, input: UpdateCategoryInput): Promise<CategoryRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Categoria');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Categoria');
    const updated = { ...existing, ...input, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Categoria');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Categoria');
    this.rows.delete(id);
  }
}

function setup() {
  const repo = new FakeCategoryRepository();
  return { repo, service: new CategoryService(repo) };
}

describe('CategoryService', () => {
  it('1) create() delega pro repositório e devolve o registro criado', async () => {
    const { service } = setup();
    const created = await service.create({ name: 'Bebidas' });
    expect(created.name).toBe('Bebidas');
    expect(created.version).toBe(0);
  });

  it('2) create() rejeita nome vazio antes de tocar o repositório', async () => {
    const { service, repo } = setup();
    await expect(service.create({ name: '   ' })).rejects.toThrow(CatalogValidationError);
    expect(repo.rows.size).toBe(0);
  });

  it('3) update() com version correta aplica e incrementa version', async () => {
    const { service } = setup();
    const created = await service.create({ name: 'Bebidas' });
    const updated = await service.update(created.id, created.version, { name: 'Bebidas Geladas' });
    expect(updated.name).toBe('Bebidas Geladas');
    expect(updated.version).toBe(1);
  });

  it('4) update() com version desatualizada propaga CatalogConflictError', async () => {
    const { service } = setup();
    const created = await service.create({ name: 'Bebidas' });
    await expect(service.update(created.id, created.version + 1, { name: 'X' })).rejects.toThrow(
      CatalogConflictError,
    );
  });

  it('5) update() com id inexistente propaga CatalogNotFoundError', async () => {
    const { service } = setup();
    await expect(service.update('cat-999', 0, { name: 'X' })).rejects.toThrow(CatalogNotFoundError);
  });

  it('6) update() rejeita nome vazio sem chamar o repositório', async () => {
    const { service } = setup();
    const created = await service.create({ name: 'Bebidas' });
    await expect(service.update(created.id, created.version, { name: '' })).rejects.toThrow(CatalogValidationError);
  });

  it('7) delete() propaga sucesso e remove do repositório', async () => {
    const { service, repo } = setup();
    const created = await service.create({ name: 'Bebidas' });
    await service.delete(created.id, created.version);
    expect(repo.rows.has(created.id)).toBe(false);
  });
});
