import { describe, expect, it } from 'vitest';
import { CategoryService } from '../category.service';
import type { CategoryRecord, CategoryRepository, CreateCategoryInput, UpdateCategoryInput } from '../category.repository';
import { CatalogConflictError, CatalogNotFoundError } from '../catalog-errors';
import { ProductService } from '../product.service';
import type { CreateProductInput, ProductRecord, ProductRepository, UpdateProductInput } from '../product.repository';
import { CatalogImportService } from './catalog-import.service';

class FakeCategoryRepository implements CategoryRepository {
  rows = new Map<string, CategoryRecord>();
  private nextId = 1;

  async list(): Promise<CategoryRecord[]> {
    return [...this.rows.values()];
  }

  async findById(id: string): Promise<CategoryRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async findByName(name: string): Promise<CategoryRecord | null> {
    const target = name.trim().toLowerCase();
    return [...this.rows.values()].find((r) => r.name.trim().toLowerCase() === target) ?? null;
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

class FakeProductRepository implements ProductRepository {
  rows = new Map<string, ProductRecord>();
  categoryIds: Set<string>;
  private nextId = 1;

  constructor(categoryIds: Set<string>) {
    this.categoryIds = categoryIds;
  }

  async listByCategory(categoryId: string): Promise<ProductRecord[]> {
    return [...this.rows.values()].filter((r) => r.categoryId === categoryId);
  }

  async findById(id: string): Promise<ProductRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async categoryExists(categoryId: string): Promise<boolean> {
    return this.categoryIds.has(categoryId);
  }

  async secondaryOfferExists(): Promise<boolean> {
    return false;
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

  async update(id: string, expectedVersion: number, input: UpdateProductInput): Promise<ProductRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Produto');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Produto');
    const updated = { ...existing, ...input, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async setAvailable(id: string, expectedVersion: number, available: boolean): Promise<ProductRecord> {
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

/**
 * FakeProductRepository.categoryExists lê o MESMO Set que FakeCategoryRepository
 * popula — precisa ficar sincronizado manualmente porque os fakes não
 * compartilham banco de verdade (ao contrário do Prisma real, onde a FK
 * composta resolve isso sozinha).
 */
function setup() {
  const categoryIds = new Set<string>();
  const categoryRepo = new FakeCategoryRepository();
  const productRepo = new FakeProductRepository(categoryIds);

  const categories = new CategoryService(categoryRepo);
  const products = new ProductService(productRepo);

  const originalCreate = categoryRepo.create.bind(categoryRepo);
  categoryRepo.create = async (input) => {
    const record = await originalCreate(input);
    categoryIds.add(record.id);
    return record;
  };

  const importService = new CatalogImportService(categories, products);
  return { importService, categoryRepo, productRepo };
}

function csvBuffer(rows: string[]): Buffer {
  const header = 'categoria,produto,descricao,preco,disponivel';
  return Buffer.from([header, ...rows].join('\n'), 'utf-8');
}

describe('CatalogImportService', () => {
  it('1) preview() não grava nada — só reporta válido/erro', () => {
    const { importService, categoryRepo, productRepo } = setup();
    const buffer = csvBuffer(['Lanches,X-Burger,,24.90,sim', 'Bebidas,,,6.00,sim']);

    const summary = importService.preview(buffer);

    expect(summary.totalRows).toBe(2);
    expect(summary.createdCount).toBe(1); // 1 válida
    expect(summary.errorCount).toBe(1); // produto vazio
    expect(categoryRepo.rows.size).toBe(0);
    expect(productRepo.rows.size).toBe(0);
  });

  it('2) commit() cria categoria nova + produto pra linha válida', async () => {
    const { importService, categoryRepo, productRepo } = setup();
    const buffer = csvBuffer(['Lanches,X-Burger,Pão e carne,24.90,sim']);

    const summary = await importService.commit(buffer);

    expect(summary.createdCount).toBe(1);
    expect(summary.errorCount).toBe(0);
    expect(categoryRepo.rows.size).toBe(1);
    expect(productRepo.rows.size).toBe(1);
    expect(summary.rows[0]?.status).toBe('created');
  });

  it('3) commit() reaproveita categoria existente (case-insensitive) em vez de duplicar', async () => {
    const { importService, categoryRepo } = setup();
    await categoryRepo.create({ name: 'lanches' }); // já existe, minúsculo

    const buffer = csvBuffer(['Lanches,X-Burger,,24.90,sim']); // planilha usa "Lanches"
    await importService.commit(buffer);

    expect(categoryRepo.rows.size).toBe(1); // não duplicou
  });

  it('4) duas linhas com a MESMA categoria nova no mesmo arquivo: categoria criada só 1 vez', async () => {
    const { importService, categoryRepo, productRepo } = setup();
    const buffer = csvBuffer(['Lanches,X-Burger,,24.90,sim', 'Lanches,X-Salada,,22.50,sim']);

    const summary = await importService.commit(buffer);

    expect(summary.createdCount).toBe(2);
    expect(categoryRepo.rows.size).toBe(1); // uma categoria só
    expect(productRepo.rows.size).toBe(2);
  });

  it('5) linha com erro de validação não interrompe as outras — commit parcial', async () => {
    const { importService, productRepo } = setup();
    const buffer = csvBuffer([
      'Lanches,X-Burger,,24.90,sim',
      'Lanches,,,10.00,sim', // produto vazio — erro
      'Lanches,X-Salada,,22.50,sim',
    ]);

    const summary = await importService.commit(buffer);

    expect(summary.totalRows).toBe(3);
    expect(summary.createdCount).toBe(2);
    expect(summary.errorCount).toBe(1);
    expect(productRepo.rows.size).toBe(2);
    expect(summary.rows[1]?.status).toBe('error');
  });

  it('6) disponivel="não" cria o produto já marcado indisponível', async () => {
    const { importService, productRepo } = setup();
    const buffer = csvBuffer(['Lanches,X-Burger,,24.90,não']);

    await importService.commit(buffer);

    const product = [...productRepo.rows.values()][0];
    expect(product?.available).toBe(false);
  });

  it('7) totalRows/createdCount/errorCount batem com o relatório por linha', async () => {
    const { importService } = setup();
    const buffer = csvBuffer(['Lanches,X-Burger,,24.90,sim', 'Bebidas,,,6.00,sim', 'Sobremesas,Pudim,,8.00,sim']);

    const summary = await importService.commit(buffer);

    expect(summary.totalRows).toBe(3);
    expect(summary.createdCount + summary.errorCount).toBe(3);
  });
});
