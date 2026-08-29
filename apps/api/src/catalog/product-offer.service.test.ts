import { describe, expect, it } from 'vitest';
import type { CatalogActor } from './catalog-actor';
import {
  CatalogConflictError,
  CatalogNotFoundError,
  CatalogValidationError,
} from './catalog-errors';
import type {
  ProductOfferFilter,
  ProductOfferRecord,
  ProductOfferRepository,
  UpdateProductOfferInput,
} from './product-offer.repository';
import { ProductOfferService } from './product-offer.service';

const ACTOR: CatalogActor = { userId: 'owner-1', role: 'owner', ip: '127.0.0.1' };

class FakeProductOfferRepository implements ProductOfferRepository {
  rows = new Map<string, ProductOfferRecord>([
    [
      'offer-1',
      {
        id: 'offer-1',
        productId: 'product-1',
        categoryId: 'category-1',
        priceCents: 2500,
        available: true,
        pdvCode: null,
        sortOrder: 0,
        isPrimary: true,
        version: 0,
      },
    ],
  ]);
  categoryIds = new Set(['category-1', 'category-2']);
  lastActor: CatalogActor | null = null;

  async list(filter: ProductOfferFilter): Promise<ProductOfferRecord[]> {
    return [...this.rows.values()].filter(
      (row) =>
        (filter.productId === undefined || row.productId === filter.productId) &&
        (filter.categoryId === undefined || row.categoryId === filter.categoryId),
    );
  }

  async findById(id: string): Promise<ProductOfferRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async categoryExists(categoryId: string): Promise<boolean> {
    return this.categoryIds.has(categoryId);
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateProductOfferInput,
    actor: CatalogActor,
  ): Promise<ProductOfferRecord> {
    const current = this.rows.get(id);
    if (!current) throw new CatalogNotFoundError('Oferta');
    if (current.version !== expectedVersion) throw new CatalogConflictError('Oferta');
    const updated = { ...current, ...input, version: current.version + 1 };
    this.rows.set(id, updated);
    this.lastActor = actor;
    return updated;
  }

  async setAvailable(
    id: string,
    expectedVersion: number,
    available: boolean,
  ): Promise<ProductOfferRecord> {
    const current = this.rows.get(id);
    if (!current) throw new CatalogNotFoundError('Oferta');
    if (current.version !== expectedVersion) throw new CatalogConflictError('Oferta');
    const updated = { ...current, available, version: current.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }
}

function setup() {
  const repo = new FakeProductOfferRepository();
  return { repo, service: new ProductOfferService(repo) };
}

describe('ProductOfferService', () => {
  it('lista a apresentação comercial por produto', async () => {
    const { service } = setup();
    const rows = await service.list({ productId: 'product-1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ categoryId: 'category-1', priceCents: 2500, isPrimary: true });
  });

  it('edita preço em centavos e preserva o ator da auditoria', async () => {
    const { repo, service } = setup();
    const updated = await service.update('offer-1', 0, { priceCents: 2790 }, ACTOR);
    expect(updated).toMatchObject({ priceCents: 2790, version: 1 });
    expect(repo.lastActor).toEqual(ACTOR);
  });

  it.each([-1, 10.5])('rejeita preço inválido: %s', async (priceCents) => {
    const { service } = setup();
    await expect(service.update('offer-1', 0, { priceCents }, ACTOR)).rejects.toThrow(
      CatalogValidationError,
    );
  });

  it('valida a nova categoria antes de mover a oferta', async () => {
    const { service } = setup();
    await expect(
      service.update('offer-1', 0, { categoryId: 'category-inexistente' }, ACTOR),
    ).rejects.toThrow(CatalogNotFoundError);

    const moved = await service.update('offer-1', 0, { categoryId: 'category-2' }, ACTOR);
    expect(moved.categoryId).toBe('category-2');
  });

  it('mantém disponibilidade em caminho separado da edição de preço', async () => {
    const { service } = setup();
    const updated = await service.setAvailable('offer-1', 0, false);
    expect(updated).toMatchObject({ available: false, priceCents: 2500, version: 1 });
  });

  it('propaga conflito de lock otimista', async () => {
    const { service } = setup();
    await expect(service.update('offer-1', 4, { priceCents: 2790 }, ACTOR)).rejects.toThrow(
      CatalogConflictError,
    );
  });
});
