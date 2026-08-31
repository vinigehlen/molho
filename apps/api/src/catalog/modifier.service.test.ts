import { describe, expect, it } from 'vitest';
import { CatalogConflictError, CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type { CreateModifierInput, ModifierRecord, ModifierRepository, UpdateModifierInput } from './modifier.repository';
import { ModifierService } from './modifier.service';

class FakeModifierRepository implements ModifierRepository {
  rows = new Map<string, ModifierRecord>();
  groupIds = new Set<string>(['mg-1']);
  private nextId = 1;

  async listByGroup(groupId: string): Promise<ModifierRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findById(id: string): Promise<ModifierRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async groupExists(groupId: string): Promise<boolean> {
    return this.groupIds.has(groupId);
  }

  async maxSortOrder(groupId: string): Promise<number> {
    return Math.max(
      -1,
      ...[...this.rows.values()].filter((row) => row.groupId === groupId).map((row) => row.sortOrder),
    );
  }

  async create(input: CreateModifierInput): Promise<ModifierRecord> {
    const record: ModifierRecord = {
      id: `mod-${this.nextId++}`,
      groupId: input.groupId,
      name: input.name,
      description: input.description ?? null,
      imageKey: input.imageKey ?? null,
      priceDeltaCents: input.priceDeltaCents,
      active: input.active ?? true,
      pdvCode: input.pdvCode ?? null,
      sortOrder: input.sortOrder ?? 0,
      version: 0,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: string, expectedVersion: number, input: UpdateModifierInput): Promise<ModifierRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Complemento');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Complemento');
    const updated = { ...existing, ...input, version: existing.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async reorder(groupId: string, items: Array<{ id: string; version: number }>): Promise<ModifierRecord[]> {
    for (const [sortOrder, item] of items.entries()) {
      const existing = this.rows.get(item.id);
      if (!existing || existing.groupId !== groupId) throw new CatalogNotFoundError('Complemento');
      if (existing.version !== item.version) throw new CatalogConflictError('Complemento');
      this.rows.set(item.id, { ...existing, sortOrder, version: existing.version + 1 });
    }
    return this.listByGroup(groupId);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) throw new CatalogNotFoundError('Complemento');
    if (existing.version !== expectedVersion) throw new CatalogConflictError('Complemento');
    this.rows.delete(id);
  }
}

function setup() {
  const repo = new FakeModifierRepository();
  return { repo, service: new ModifierService(repo) };
}

describe('ModifierService', () => {
  it('1) create() delega quando o grupo existe e o preço é válido', async () => {
    const { service } = setup();
    const created = await service.create({ groupId: 'mg-1', name: 'Bacon extra', priceDeltaCents: 500 });
    expect(created.priceDeltaCents).toBe(500);
  });

  it('2) create() rejeita grupo inexistente', async () => {
    const { service, repo } = setup();
    await expect(
      service.create({ groupId: 'mg-inexistente', name: 'Bacon extra', priceDeltaCents: 500 }),
    ).rejects.toThrow(CatalogNotFoundError);
    expect(repo.rows.size).toBe(0);
  });

  it('3) create() rejeita price_delta_cents negativo — complemento nunca reduz o preço base', async () => {
    const { service } = setup();
    await expect(service.create({ groupId: 'mg-1', name: 'Bacon extra', priceDeltaCents: -500 })).rejects.toThrow(
      CatalogValidationError,
    );
  });

  it('4) create() aceita price_delta_cents zero (complemento sem custo adicional)', async () => {
    const { service } = setup();
    const created = await service.create({ groupId: 'mg-1', name: 'Sem cebola', priceDeltaCents: 0 });
    expect(created.priceDeltaCents).toBe(0);
  });

  it('5) update() com version desatualizada propaga CatalogConflictError', async () => {
    const { service } = setup();
    const created = await service.create({ groupId: 'mg-1', name: 'Bacon extra', priceDeltaCents: 500 });
    await expect(service.update(created.id, created.version + 1, { name: 'X' })).rejects.toThrow(
      CatalogConflictError,
    );
  });

  it('6) delete() remove do repositório', async () => {
    const { service, repo } = setup();
    const created = await service.create({ groupId: 'mg-1', name: 'Bacon extra', priceDeltaCents: 500 });
    await service.delete(created.id, created.version);
    expect(repo.rows.has(created.id)).toBe(false);
  });

  it('7) cria no fim da ordem e permite editar conteúdo, estoque e PDV', async () => {
    const { service } = setup();
    const first = await service.create({ groupId: 'mg-1', name: 'Bacon', priceDeltaCents: 500 });
    const second = await service.create({ groupId: 'mg-1', name: 'Ovo', priceDeltaCents: 300 });

    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);

    const updated = await service.update(second.id, second.version, {
      description: 'Ovo caipira.',
      imageKey: 'products/t/ovo.webp',
      active: false,
      pdvCode: 'OVO-1',
      sortOrder: 0,
    });
    expect(updated).toMatchObject({
      description: 'Ovo caipira.',
      imageKey: 'products/t/ovo.webp',
      active: false,
      pdvCode: 'OVO-1',
      sortOrder: 0,
    });
  });

  it('8) reordena a lista inteira e incrementa as versões', async () => {
    const { service } = setup();
    const first = await service.create({ groupId: 'mg-1', name: 'Bacon', priceDeltaCents: 500 });
    const second = await service.create({ groupId: 'mg-1', name: 'Ovo', priceDeltaCents: 300 });

    const reordered = await service.reorder('mg-1', [
      { id: second.id, version: second.version },
      { id: first.id, version: first.version },
    ]);

    expect(reordered.map((item) => item.name)).toEqual(['Ovo', 'Bacon']);
    expect(reordered.map((item) => item.version)).toEqual([1, 1]);
  });

  it('9) rejeita lista parcial ou com item duplicado', async () => {
    const { service } = setup();
    const first = await service.create({ groupId: 'mg-1', name: 'Bacon', priceDeltaCents: 500 });
    await service.create({ groupId: 'mg-1', name: 'Ovo', priceDeltaCents: 300 });

    await expect(service.reorder('mg-1', [{ id: first.id, version: first.version }])).rejects.toThrow(
      CatalogValidationError,
    );
    await expect(
      service.reorder('mg-1', [
        { id: first.id, version: first.version },
        { id: first.id, version: first.version },
      ]),
    ).rejects.toThrow(CatalogValidationError);
  });

  it('10) rejeita posição negativa na criação e na edição', async () => {
    const { service } = setup();
    await expect(
      service.create({ groupId: 'mg-1', name: 'Bacon', priceDeltaCents: 500, sortOrder: -1 }),
    ).rejects.toThrow(CatalogValidationError);

    const created = await service.create({ groupId: 'mg-1', name: 'Bacon', priceDeltaCents: 500 });
    await expect(service.update(created.id, created.version, { sortOrder: -1 })).rejects.toThrow(
      CatalogValidationError,
    );
  });
});
