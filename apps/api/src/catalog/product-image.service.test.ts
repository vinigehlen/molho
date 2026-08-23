import { describe, expect, it } from 'vitest';
import { CatalogConflictError, CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  CreateProductImageInput,
  ProductImageRecord,
  ProductImageRepository,
  UpdateProductImageInput,
} from './product-image.repository';
import { ProductImageService } from './product-image.service';

class FakeProductImageRepository implements ProductImageRepository {
  rows = new Map<string, ProductImageRecord>();
  productIds = new Set<string>(['p-1']);
  private nextId = 1;

  async listByProduct(productId: string): Promise<ProductImageRecord[]> {
    return [...this.rows.values()].filter((r) => r.productId === productId).sort((a, b) => a.position - b.position);
  }

  async findById(id: string): Promise<ProductImageRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async productExists(productId: string): Promise<boolean> {
    return this.productIds.has(productId);
  }

  async maxPosition(productId: string): Promise<number> {
    const positions = [...this.rows.values()].filter((r) => r.productId === productId).map((r) => r.position);
    return positions.length === 0 ? -1 : Math.max(...positions);
  }

  async create(input: CreateProductImageInput): Promise<ProductImageRecord> {
    const record: ProductImageRecord = {
      id: `img-${this.nextId++}`,
      productId: input.productId,
      imageKey: input.imageKey,
      position: input.position,
      version: 0,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: string, expectedVersion: number, input: UpdateProductImageInput): Promise<ProductImageRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Foto do produto');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Foto do produto');
    const updated = { ...existing, ...input, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Foto do produto');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Foto do produto');
    this.rows.delete(id);
  }
}

function setup() {
  const repo = new FakeProductImageRepository();
  return { repo, service: new ProductImageService(repo) };
}

describe('ProductImageService', () => {
  it('1) add() entra em position 0 quando a galeria está vazia', async () => {
    const { service } = setup();
    const created = await service.add({ productId: 'p-1', imageKey: 'k1' });
    expect(created.position).toBe(0);
  });

  it('2) add() sem position entra no FIM da galeria', async () => {
    const { service } = setup();
    await service.add({ productId: 'p-1', imageKey: 'k1' });
    await service.add({ productId: 'p-1', imageKey: 'k2' });
    const terceira = await service.add({ productId: 'p-1', imageKey: 'k3' });
    expect(terceira.position).toBe(2);
  });

  it('3) add() com position explícita respeita o valor pedido', async () => {
    const { service } = setup();
    const created = await service.add({ productId: 'p-1', imageKey: 'k1', position: 5 });
    expect(created.position).toBe(5);
  });

  it('4) add() rejeita produto inexistente', async () => {
    const { service, repo } = setup();
    await expect(service.add({ productId: 'p-inexistente', imageKey: 'k1' })).rejects.toThrow(CatalogNotFoundError);
    expect(repo.rows.size).toBe(0);
  });

  it('5) add() rejeita image_key vazio', async () => {
    const { service } = setup();
    await expect(service.add({ productId: 'p-1', imageKey: '  ' })).rejects.toThrow(CatalogValidationError);
  });

  it('6) reorder() com position negativa é rejeitado', async () => {
    const { service } = setup();
    const created = await service.add({ productId: 'p-1', imageKey: 'k1' });
    await expect(service.reorder(created.id, created.version, { position: -1 })).rejects.toThrow(
      CatalogValidationError,
    );
  });

  it('7) reorder() com version desatualizada propaga CatalogConflictError', async () => {
    const { service } = setup();
    const created = await service.add({ productId: 'p-1', imageKey: 'k1' });
    await expect(service.reorder(created.id, created.version + 1, { position: 3 })).rejects.toThrow(
      CatalogConflictError,
    );
  });

  it('8) reorder() muda a position e incrementa a version', async () => {
    const { service } = setup();
    const created = await service.add({ productId: 'p-1', imageKey: 'k1' });
    const updated = await service.reorder(created.id, created.version, { position: 3 });
    expect(updated.position).toBe(3);
    expect(updated.version).toBe(1);
  });

  it('9) delete() remove do repositório', async () => {
    const { service, repo } = setup();
    const created = await service.add({ productId: 'p-1', imageKey: 'k1' });
    await service.delete(created.id, created.version);
    expect(repo.rows.has(created.id)).toBe(false);
  });

  it('10) listByProduct() devolve em ordem de position', async () => {
    const { service } = setup();
    await service.add({ productId: 'p-1', imageKey: 'k1', position: 2 });
    await service.add({ productId: 'p-1', imageKey: 'k2', position: 0 });
    await service.add({ productId: 'p-1', imageKey: 'k3', position: 1 });
    const galeria = await service.listByProduct('p-1');
    expect(galeria.map((i) => i.imageKey)).toEqual(['k2', 'k3', 'k1']);
  });
});
