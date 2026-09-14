import { describe, expect, it, vi } from 'vitest';
import type { StoreAdminRepository } from './store-admin.repository';
import { StoreAdminService } from './store-admin.service';

const TENANT_ID = 'tenant-1';

function makeRepo(overrides: Partial<StoreAdminRepository> = {}) {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation((tenantId, data) =>
      Promise.resolve({ id: 'store-2', isPrimary: false, createdAt: '2026-01-01T00:00:00.000Z', ...data }),
    ),
    ...overrides,
  } as unknown as StoreAdminRepository;
}

function makeRequestContext(existingSlugs: string[] = []) {
  return {
    getClient: () => ({
      store: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { slug: string } }) =>
          Promise.resolve(existingSlugs.includes(where.slug) ? { id: 'taken' } : null),
        ),
      },
    }),
  } as never;
}

describe('StoreAdminService.create', () => {
  it('gera slug a partir do nome quando livre', async () => {
    const repo = makeRepo();
    const service = new StoreAdminService(repo, makeRequestContext());

    const result = await service.create({ name: 'Filial Zona Sul', addressText: 'Rua X, 1', timezone: 'America/Sao_Paulo' }, TENANT_ID);

    expect(result.slug).toBe('filial-zona-sul');
    expect(repo.create).toHaveBeenCalledWith(TENANT_ID, expect.objectContaining({ slug: 'filial-zona-sul' }));
  });

  it('slug colidindo no tenant ganha sufixo -2', async () => {
    const repo = makeRepo();
    const service = new StoreAdminService(repo, makeRequestContext(['filial-zona-sul']));

    const result = await service.create({ name: 'Filial Zona Sul', addressText: 'Rua X, 1', timezone: 'America/Sao_Paulo' }, TENANT_ID);

    expect(result.slug).toBe('filial-zona-sul-2');
  });
});
