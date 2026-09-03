import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RequestContextService } from '../context/request-context.service';
import { PrismaStoreSetupRepository } from './store-setup.repository';

const STORE_ID = 'store-1';
const TENANT_ID = 'tenant-1';

interface FakeTenant {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  themeKey?: string;
  onboardedAt?: Date | null;
}

interface FakeState {
  lastStoreData?: Record<string, unknown>;
}

/** Fake mínimo do `Prisma.TransactionClient` — só o que `store-setup.repository.ts`
 * toca. `$queryRaw` (lockStoreOrThrow) ignora o SQL de verdade, devolve sempre
 * a mesma loja: o teste não exercita concorrência, só a sincronia nome/slug. */
function fakeRequestContext(tenant: FakeTenant, state: FakeState = {}) {
  const store = {
    id: STORE_ID, tenantId: TENANT_ID, name: tenant.name, legalName: null, stateRegistration: null, publicDescription: null,
    addressText: 'Rua X', postalCode: null, street: null, number: null, neighborhood: null, city: null, state: null, complement: null, referencePoint: null,
    phone: null, whatsappNumber: null, logoImageKey: null, coverImageKey: null,
    responsibleCpfCiphertext: null, responsibleCpfKeyVersion: 1, responsiblePhoneCiphertext: null, responsiblePhoneKeyVersion: 1,
    financeEmailCiphertext: null, financeEmailKeyVersion: 1, minOrderCents: 0, pixKey: null, pixKeyType: null, pixMerchantCity: null,
    timezone: 'America/Sao_Paulo',
  };
  const otherTenants: FakeTenant[] = [];

  const client = {
    $queryRaw: async () => [{ id: STORE_ID, tenantId: TENANT_ID }],
    tenant: {
      findFirst: async ({ where, select }: { where: { id?: string; slug?: string; deletedAt: null; id_not?: { not: string } }; select?: Record<string, boolean> }) => {
        const pool = [tenant, ...otherTenants];
        const found = pool.find((t) => (where.id ? t.id === where.id : true) && (where.slug ? t.slug === where.slug : true));
        if (!found) return null;
        if (select?.cnpj !== undefined || select?.slug !== undefined) {
          return { cnpj: found.cnpj, slug: found.slug, themeKey: found.themeKey ?? 'brasa', onboardedAt: found.onboardedAt ?? null };
        }
        return found;
      },
      updateMany: async ({ where, data }: { where: { id: string }; data: Partial<FakeTenant> }) => {
        if (where.id === tenant.id) Object.assign(tenant, data);
        return { count: 1 };
      },
    },
    store: {
      findFirst: async () => ({ ...store, tenant: { cnpj: tenant.cnpj, slug: tenant.slug, themeKey: tenant.themeKey ?? 'brasa', onboardedAt: tenant.onboardedAt ?? null } }),
      updateMany: async ({ data }: { data: Partial<typeof store> }) => {
        state.lastStoreData = data;
        Object.assign(store, data);
        return { count: 1 };
      },
    },
    user: { updateMany: async () => ({ count: 1 }), findFirst: async () => ({ name: 'Owner Teste' }) },
    auditLog: { create: async () => ({}) },
    $executeRaw: async () => 1,
  };

  return { getClient: () => client } as unknown as RequestContextService;
}

const BASE_INPUT = {
  cnpj: null,
  ownerName: null,
  legalName: null,
  stateRegistration: null,
  publicDescription: null,
  addressText: 'Rua X',
  postalCode: null,
  street: null,
  number: null,
  neighborhood: null,
  city: null,
  state: null,
  complement: null,
  referencePoint: null,
  phone: null,
  whatsappNumber: null,
  logoImageKey: null,
  coverImageKey: null,
  responsibleCpf: null,
  responsiblePhone: null,
  financeEmail: null,
  minOrderCents: 0,
  pixKey: null,
  pixKeyType: null,
  pixMerchantCity: null,
};

beforeEach(() => {
  process.env.MOLHO_ENCRYPTION_KEYS = JSON.stringify({ '1': Buffer.alloc(32, 7).toString('base64') });
  process.env.MOLHO_EMAIL_PEPPER = Buffer.alloc(32, 9).toString('base64');
});

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

  it('salva dados do responsável cifrados, nunca em claro no dado enviado ao banco', async () => {
    const tenant: FakeTenant = { id: TENANT_ID, name: 'Cabanhas BBQ', slug: 'cabanhas-bbq', cnpj: null };
    const state: FakeState = {};
    const repo = new PrismaStoreSetupRepository(fakeRequestContext(tenant, state));

    const saved = await repo.update(
      STORE_ID,
      {
        ...BASE_INPUT,
        name: 'Cabanhas BBQ',
        responsibleCpf: '123.456.789-00',
        responsiblePhone: '(51) 99999-0000',
        financeEmail: 'Financeiro@Cabanhas.test',
      },
      { userId: '018f3c2a-0000-7000-8000-000000000001', role: 'owner' },
    );

    expect(saved.responsibleCpf).toBe('12345678900');
    expect(saved.responsiblePhone).toBe('+5551999990000');
    expect(saved.financeEmail).toBe('financeiro@cabanhas.test');
    expect(state.lastStoreData?.responsibleCpfCiphertext).toBeInstanceOf(Uint8Array);
    expect(state.lastStoreData?.responsiblePhoneCiphertext).toBeInstanceOf(Uint8Array);
    expect(state.lastStoreData?.financeEmailCiphertext).toBeInstanceOf(Uint8Array);
    expect(JSON.stringify(state.lastStoreData)).not.toContain('12345678900');
    expect(JSON.stringify(state.lastStoreData)).not.toContain('+5551999990000');
    expect(JSON.stringify(state.lastStoreData)).not.toContain('financeiro@cabanhas.test');
  });
});

describe('PrismaStoreSetupRepository — tema, publicação e marca (Épico 13/13b)', () => {
  const ORIGINAL_S3_PUBLIC_URL = process.env.S3_PUBLIC_URL;
  afterEach(() => {
    process.env.S3_PUBLIC_URL = ORIGINAL_S3_PUBLIC_URL;
  });

  it('troca o tema e resolve logo/capa pra URL pública quando S3_PUBLIC_URL está setada', async () => {
    process.env.S3_PUBLIC_URL = 'https://pub-abc.r2.dev';
    const tenant: FakeTenant = { id: TENANT_ID, name: 'Cabanhas BBQ', slug: 'cabanhas-bbq', cnpj: null, themeKey: 'brasa', onboardedAt: null };
    const repo = new PrismaStoreSetupRepository(fakeRequestContext(tenant));

    const themed = await repo.updateTheme(STORE_ID, 'folha');
    expect(themed.themeKey).toBe('folha');
    expect(themed.onboardedAt).toBeNull();

    const saved = await repo.update(STORE_ID, { ...BASE_INPUT, name: 'Cabanhas BBQ', logoImageKey: 'stores/tenant-1/logo.png', coverImageKey: 'stores/tenant-1/capa.png' });
    expect(saved.logoImageUrl).toBe('https://pub-abc.r2.dev/stores/tenant-1/logo.png');
    expect(saved.coverImageUrl).toBe('https://pub-abc.r2.dev/stores/tenant-1/capa.png');
  });

  it('sem S3_PUBLIC_URL, logoImageUrl/coverImageUrl caem em null mesmo com chave salva', async () => {
    delete process.env.S3_PUBLIC_URL;
    const tenant: FakeTenant = { id: TENANT_ID, name: 'Cabanhas BBQ', slug: 'cabanhas-bbq', cnpj: null };
    const repo = new PrismaStoreSetupRepository(fakeRequestContext(tenant));

    const saved = await repo.update(STORE_ID, { ...BASE_INPUT, name: 'Cabanhas BBQ', logoImageKey: 'stores/tenant-1/logo.png' });
    expect(saved.logoImageUrl).toBeNull();
  });
});
