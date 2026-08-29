import { describe, expect, it } from 'vitest';
import type { RequestContextService } from '../context/request-context.service';
import { PrismaStoreSetupRepository } from './store-setup.repository';

const STORE_ID = 'store-1';
const TENANT_ID = 'tenant-1';

interface FakeTenant {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
}

/** Fake mínimo do `Prisma.TransactionClient` — só o que `store-setup.repository.ts`
 * toca. `$queryRaw` (lockStoreOrThrow) ignora o SQL de verdade, devolve sempre
 * a mesma loja: o teste não exercita concorrência, só a sincronia nome/slug. */
function fakeRequestContext(tenant: FakeTenant) {
  const store = { id: STORE_ID, tenantId: TENANT_ID, name: tenant.name, addressText: 'Rua X', phone: null, whatsappNumber: null, minOrderCents: 0, pixKey: null, pixKeyType: null, pixMerchantCity: null, timezone: 'America/Sao_Paulo' };
  const otherTenants: FakeTenant[] = [];

  const client = {
    $queryRaw: async () => [{ id: STORE_ID, tenantId: TENANT_ID }],
    tenant: {
      findFirst: async ({ where, select }: { where: { id?: string; slug?: string; deletedAt: null; id_not?: { not: string } }; select?: Record<string, boolean> }) => {
        const pool = [tenant, ...otherTenants];
        const found = pool.find((t) => (where.id ? t.id === where.id : true) && (where.slug ? t.slug === where.slug : true));
        if (!found) return null;
        if (select?.cnpj !== undefined || select?.slug !== undefined) return { cnpj: found.cnpj, slug: found.slug };
        return found;
      },
      updateMany: async ({ where, data }: { where: { id: string }; data: Partial<FakeTenant> }) => {
        if (where.id === tenant.id) Object.assign(tenant, data);
        return { count: 1 };
      },
    },
    store: {
      findFirst: async () => ({ ...store, tenant: { cnpj: tenant.cnpj, slug: tenant.slug } }),
      updateMany: async ({ data }: { data: Partial<typeof store> }) => {
        Object.assign(store, data);
        return { count: 1 };
      },
    },
    user: { updateMany: async () => ({ count: 1 }) },
  };

  return { getClient: () => client } as unknown as RequestContextService;
}

const BASE_INPUT = {
  cnpj: null,
  ownerName: null,
  addressText: 'Rua X',
  phone: null,
  whatsappNumber: null,
  minOrderCents: 0,
  pixKey: null,
  pixKeyType: null,
  pixMerchantCity: null,
};

describe('PrismaStoreSetupRepository — nome fantasia sincroniza domínio', () => {
  it('renomear a loja regenera o slug do tenant', async () => {
    const tenant: FakeTenant = { id: TENANT_ID, name: 'Cabanhas BBQ', slug: 'cabanhas-bbq', cnpj: null };
    const repo = new PrismaStoreSetupRepository(fakeRequestContext(tenant));

    const saved = await repo.update(STORE_ID, { ...BASE_INPUT, name: 'Cabanhas Churrasco' });

    expect(saved.tenantSlug).toBe('cabanhas-churrasco');
    expect(tenant.slug).toBe('cabanhas-churrasco');
    expect(tenant.name).toBe('Cabanhas Churrasco');
  });

  it('salvar o MESMO nome não mexe no slug (nem gera -2 por acaso)', async () => {
    const tenant: FakeTenant = { id: TENANT_ID, name: 'Cabanhas BBQ', slug: 'cabanhas-bbq', cnpj: null };
    const repo = new PrismaStoreSetupRepository(fakeRequestContext(tenant));

    const saved = await repo.update(STORE_ID, { ...BASE_INPUT, name: 'Cabanhas BBQ' });

    expect(saved.tenantSlug).toBe('cabanhas-bbq');
  });

  it('get() reflete o tenantSlug atual', async () => {
    const tenant: FakeTenant = { id: TENANT_ID, name: 'Cabanhas BBQ', slug: 'cabanhas-bbq', cnpj: null };
    const repo = new PrismaStoreSetupRepository(fakeRequestContext(tenant));

    const setup = await repo.get(STORE_ID);

    expect(setup.tenantSlug).toBe('cabanhas-bbq');
  });
});
