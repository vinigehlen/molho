import { describe, expect, it } from 'vitest';
import {
  CatalogConflictError,
  CatalogNotFoundError,
  CatalogValidationError,
} from './catalog-errors';
import type {
  CreateProductInput,
  ProductRecord,
  ProductRepository,
  UpdateProductInput,
} from './product.repository';
import { ProductService } from './product.service';

const ACTOR = { userId: 'owner-1', role: 'owner', ip: '127.0.0.1' } as const;

class FakeProductRepository implements ProductRepository {
  rows = new Map<string, ProductRecord>();
  categoryIds = new Set<string>(['cat-1']);
  secondaryCategoryIds = new Set<string>();
  private nextId = 1;

  async listByCategory(categoryId: string): Promise<ProductRecord[]> {
    return [...this.rows.values()].filter((r) => r.categoryId === categoryId);
  }

  async findById(id: string): Promise<ProductRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async categoryExists(categoryId: string): Promise<boolean> {
    return this.categoryIds.has(categoryId);
  }

  async secondaryOfferExists(_productId: string, categoryId: string): Promise<boolean> {
    return this.secondaryCategoryIds.has(categoryId);
  }

  async create(input: CreateProductInput): Promise<ProductRecord> {
    const record: ProductRecord = {
      id: `prod-${this.nextId++}`,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? null,
      basePriceCents: input.basePriceCents,
      imageKey: null,
      available: true,
      pdvCode: input.pdvCode ?? null,
      kind: input.kind ?? 'prepared',
      sortOrder: input.sortOrder ?? 0,
      version: 0,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateProductInput,
  ): Promise<ProductRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Produto');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Produto');
    const updated = { ...existing, ...input, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async setAvailable(
    id: string,
    expectedVersion: number,
    available: boolean,
  ): Promise<ProductRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Produto');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Produto');
    const updated = { ...existing, available, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Produto');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Produto');
    this.rows.delete(id);
  }
}

function setup() {
  const repo = new FakeProductRepository();
  return { repo, service: new ProductService(repo) };
}

describe('ProductService', () => {
  it('1) create() delega pro repositório quando a categoria existe', async () => {
    const { service } = setup();
    const created = await service.create({
      categoryId: 'cat-1',
      name: 'X-Burger',
      basePriceCents: 2500,
    });
    expect(created.name).toBe('X-Burger');
    expect(created.available).toBe(true);
  });

  it('não move a oferta principal para uma categoria já usada por uma secundária', async () => {
    const { repo, service } = setup();
    repo.categoryIds.add('cat-2');
    const created = await service.create({
      categoryId: 'cat-1',
      name: 'X-Burger',
      basePriceCents: 2500,
    });
    repo.secondaryCategoryIds.add('cat-2');

    await expect(
      service.update(created.id, created.version, { categoryId: 'cat-2' }, ACTOR),
    ).rejects.toThrow('Este produto já está disponível nesta categoria.');
  });

  it('2) create() rejeita categoria inexistente sem chamar o repositório', async () => {
    const { service, repo } = setup();
    await expect(
      service.create({ categoryId: 'cat-inexistente', name: 'X-Burger', basePriceCents: 2500 }),
    ).rejects.toThrow(CatalogNotFoundError);
    expect(repo.rows.size).toBe(0);
  });

  it('3) create() rejeita preço negativo (dinheiro é inteiro em centavos, nunca float)', async () => {
    const { service } = setup();
    await expect(
      service.create({ categoryId: 'cat-1', name: 'X-Burger', basePriceCents: -100 }),
    ).rejects.toThrow(CatalogValidationError);
  });

  it('4) create() rejeita preço não-inteiro', async () => {
    const { service } = setup();
    await expect(
      service.create({ categoryId: 'cat-1', name: 'X-Burger', basePriceCents: 25.5 }),
    ).rejects.toThrow(CatalogValidationError);
  });

  it('5) create() rejeita nome vazio', async () => {
    const { service } = setup();
    await expect(
      service.create({ categoryId: 'cat-1', name: '', basePriceCents: 2500 }),
    ).rejects.toThrow(CatalogValidationError);
  });

  it('6) update() movendo categoryId valida a nova categoria', async () => {
    const { service, repo } = setup();
    const created = await service.create({
      categoryId: 'cat-1',
      name: 'X-Burger',
      basePriceCents: 2500,
    });
    await expect(
      service.update(created.id, created.version, { categoryId: 'cat-inexistente' }, ACTOR),
    ).rejects.toThrow(CatalogNotFoundError);

    repo.categoryIds.add('cat-2');
    const updated = await service.update(
      created.id,
      created.version,
      { categoryId: 'cat-2' },
      ACTOR,
    );
    expect(updated.categoryId).toBe('cat-2');
  });

  it('7) setAvailable() é o único caminho pra alterar "available" — separado de update() (§5-C.5)', async () => {
    const { service } = setup();
    const created = await service.create({
      categoryId: 'cat-1',
      name: 'X-Burger',
      basePriceCents: 2500,
    });
    const updated = await service.setAvailable(created.id, created.version, false);
    expect(updated.available).toBe(false);
    expect(updated.name).toBe('X-Burger'); // não mexeu em mais nada
  });

  it('8) setAvailable() com version desatualizada propaga CatalogConflictError', async () => {
    const { service } = setup();
    const created = await service.create({
      categoryId: 'cat-1',
      name: 'X-Burger',
      basePriceCents: 2500,
    });
    await expect(service.setAvailable(created.id, created.version + 1, false)).rejects.toThrow(
      CatalogConflictError,
    );
  });

  it('9) delete() remove do repositório', async () => {
    const { service, repo } = setup();
    const created = await service.create({
      categoryId: 'cat-1',
      name: 'X-Burger',
      basePriceCents: 2500,
    });
    await service.delete(created.id, created.version);
    expect(repo.rows.has(created.id)).toBe(false);
  });
});
