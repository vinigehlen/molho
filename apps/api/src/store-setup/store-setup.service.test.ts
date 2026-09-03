import { describe, expect, it } from 'vitest';
import type { StoreSetup, ThemeKey, UpdateStoreSetupInput } from '@molho/contracts';
import { StoreSetupValidationError } from './store-setup.errors';
import type { StoreSetupRepository } from './store-setup.repository';
import { StoreSetupService } from './store-setup.service';

const STORE: StoreSetup = {
  id: '01980000-0000-7000-8000-000000000001',
  tenantId: '01980000-0000-7000-8000-000000000002',
  tenantSlug: 'casa-molho',
  cnpj: null,
  ownerName: null,
  name: 'Casa Molho',
  legalName: null,
  stateRegistration: null,
  publicDescription: null,
  addressText: 'Rua das Panelas, 10',
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
  logoImageUrl: null,
  coverImageKey: null,
  coverImageUrl: null,
  responsibleCpf: null,
  responsiblePhone: null,
  financeEmail: null,
  minOrderCents: 0,
  pixKey: null,
  pixKeyType: null,
  pixMerchantCity: null,
  timezone: 'America/Sao_Paulo',
  themeKey: 'brasa',
  onboardedAt: null,
};

const INPUT: UpdateStoreSetupInput = {
  cnpj: '12.345.678/0001-90',
  ownerName: 'Dona Molho',
  name: 'Casa Molho',
  legalName: 'Casa Molho Ltda',
  stateRegistration: 'ISENTO',
  publicDescription: 'Comida brasileira no capricho.',
  addressText: 'Rua das Panelas, 10',
  postalCode: '93610000',
  street: 'Rua das Panelas',
  number: '10',
  neighborhood: 'Centro',
  city: 'Estância Velha',
  state: 'RS',
  complement: null,
  referencePoint: null,
  phone: null,
  whatsappNumber: '51999990000',
  logoImageKey: null,
  coverImageKey: null,
  responsibleCpf: '00000000000',
  responsiblePhone: '+5551999990000',
  financeEmail: 'financeiro@casa.test',
  minOrderCents: 2500,
  pixKey: 'pix@molho.test',
  pixKeyType: 'email',
  pixMerchantCity: 'Sao Paulo',
};

class FakeRepo implements StoreSetupRepository {
  updates: UpdateStoreSetupInput[] = [];

  async get(): Promise<StoreSetup> {
    return STORE;
  }

  async update(_storeId: string, input: UpdateStoreSetupInput): Promise<StoreSetup> {
    this.updates.push(input);
    return { ...STORE, ...input, logoImageUrl: null, coverImageUrl: null };
  }

  async updateTheme(_storeId: string, themeKey: ThemeKey): Promise<StoreSetup> {
    return { ...STORE, themeKey };
  }

  async publish(): Promise<StoreSetup> {
    return { ...STORE, onboardedAt: new Date().toISOString() };
  }
}

describe('StoreSetupService', () => {
  it('salva configuração básica e PIX completo', async () => {
    const repo = new FakeRepo();
    const service = new StoreSetupService(repo);

    const saved = await service.update('store-1', INPUT);

    expect(saved).toMatchObject({ cnpj: '12.345.678/0001-90', ownerName: 'Dona Molho', legalName: 'Casa Molho Ltda', responsiblePhone: '+5551999990000', pixKey: 'pix@molho.test', pixKeyType: 'email', pixMerchantCity: 'Sao Paulo' });
    expect(repo.updates).toHaveLength(1);
  });

  it('rejeita chave PIX sem tipo ou cidade', async () => {
    const service = new StoreSetupService(new FakeRepo());

    await expect(service.update('store-1', { ...INPUT, pixKeyType: null })).rejects.toBeInstanceOf(StoreSetupValidationError);
    await expect(service.update('store-1', { ...INPUT, pixMerchantCity: null })).rejects.toBeInstanceOf(StoreSetupValidationError);
  });

  it('troca o tema da loja', async () => {
    const service = new StoreSetupService(new FakeRepo());
    const saved = await service.updateTheme('store-1', 'folha');
    expect(saved.themeKey).toBe('folha');
  });

  it('publica a loja (repassa pro repositório, que revalida o checklist)', async () => {
    const service = new StoreSetupService(new FakeRepo());
    const saved = await service.publish('store-1', 'user-1');
    expect(saved.onboardedAt).not.toBeNull();
  });
});
