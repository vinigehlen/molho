import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryZoneResponse } from '../../../lib/delivery-zones-api';
import ConfiguracaoPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getStaffSession: vi.fn(),
  setStaffSession: vi.fn(),
  fetchMyStores: vi.fn(),
  fetchStoreSetup: vi.fn(),
  saveStoreSetup: vi.fn(),
  saveStoreTheme: vi.fn(),
  publishStore: vi.fn(),
  uploadStoreBrandImage: vi.fn(),
  fetchStoreHours: vi.fn(),
  saveStoreHours: vi.fn(),
  fetchDeliveryZones: vi.fn(),
  createDeliveryZone: vi.fn(),
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
}));

vi.mock('../../../lib/staff-session', () => ({ getStaffSession: mocks.getStaffSession, setStaffSession: mocks.setStaffSession }));
vi.mock('../../../lib/my-stores-api', () => ({ fetchMyStores: mocks.fetchMyStores }));
vi.mock('../../../lib/store-setup-api', () => ({
  fetchStoreSetup: mocks.fetchStoreSetup,
  saveStoreSetup: mocks.saveStoreSetup,
  saveStoreTheme: mocks.saveStoreTheme,
  publishStore: mocks.publishStore,
  uploadStoreBrandImage: mocks.uploadStoreBrandImage,
}));
vi.mock('../../../lib/store-hours-api', () => ({
  fetchStoreHours: mocks.fetchStoreHours,
  saveStoreHours: mocks.saveStoreHours,
}));
vi.mock('../../../lib/delivery-zones-api', () => ({
  fetchDeliveryZones: mocks.fetchDeliveryZones,
  createDeliveryZone: mocks.createDeliveryZone,
}));
// Configuração só lê categorias/produtos pra saber se o passo "Cardápio" do
// checklist está completo — o CRUD de verdade mora em /gestor/cardapio.
vi.mock('../../../lib/catalog-api', () => ({
  fetchCategories: mocks.fetchCategories,
  fetchProducts: mocks.fetchProducts,
}));

const STORE = { id: '0193f1a0-0000-7000-8000-000000000001', name: 'Cabanhas BBQ' };
const ZONE: DeliveryZoneResponse = {
  id: 'zone-1',
  name: 'Centro',
  kind: 'city',
  city: 'Estância Velha',
  state: 'RS',
  feeCents: 800,
  etaMinMinutes: 30,
  etaMaxMinutes: 50,
  priority: 0,
  version: 0,
};

function incompleteSetup() {
  return {
    id: STORE.id,
    tenantId: 'tenant-1',
    tenantSlug: 'cabanhas-bbq',
    cnpj: null,
    ownerName: null,
    name: '',
    legalName: null,
    stateRegistration: null,
    publicDescription: null,
    addressText: '',
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
    themeKey: 'brasa' as const,
    onboardedAt: null,
  };
}

function completeSetup() {
  return {
    ...incompleteSetup(),
    cnpj: '12.345.678/0001-90',
    ownerName: 'Maria',
    name: 'Cabanhas BBQ',
    legalName: 'Cabanhas Churrasco Ltda',
    stateRegistration: 'ISENTO',
    publicDescription: 'Churrasco no capricho.',
    addressText: 'Rua das Carnes, 100',
    postalCode: '93610000',
    street: 'Rua das Carnes',
    number: '100',
    neighborhood: 'Centro',
    city: 'Estância Velha',
    state: 'RS',
    complement: null,
    referencePoint: 'Ao lado da praça',
    phone: '5199999999',
    whatsappNumber: '5199999999',
    responsibleCpf: '00000000000',
    responsiblePhone: '+5551999990000',
    financeEmail: 'financeiro@cabanhas.test',
    pixKey: 'chave@pix.com',
    pixKeyType: 'email' as const,
    pixMerchantCity: 'ESTANCIA VELHA',
  };
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ConfiguracaoPage />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

let sessionState: Record<string, unknown> | null;

beforeEach(() => {
  vi.clearAllMocks();
  sessionState = { accessToken: 't', tenantId: 'tenant-1', userId: 'u1', tenantName: 'Cabanhas' };
  mocks.getStaffSession.mockImplementation(() => sessionState);
  mocks.setStaffSession.mockImplementation((next: Record<string, unknown>) => {
    sessionState = next;
  });
  mocks.fetchMyStores.mockResolvedValue([STORE]);
  mocks.fetchStoreHours.mockResolvedValue({ shifts: [] });
  mocks.fetchDeliveryZones.mockResolvedValue([]);
  mocks.fetchCategories.mockResolvedValue([]);
  mocks.fetchProducts.mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('ConfiguracaoPage — barra de publicação compacta (Bloco 1)', () => {
  it('nada preenchido: badge 0/5, "Loja em preparo"', async () => {
    mocks.fetchStoreSetup.mockResolvedValue(incompleteSetup());
    await mount();

    expect(container.textContent).toContain('0/5');
    expect(container.textContent).toContain('Loja em preparo');
    expect(container.textContent).toContain('Falta completar: Loja.');
  });

  it('só a loja completa: badge 1/5, próximo passo aponta pra Horários', async () => {
    mocks.fetchStoreSetup.mockResolvedValue({ ...completeSetup(), pixKey: null, pixKeyType: null, pixMerchantCity: null });
    await mount();

    expect(container.textContent).toContain('1/5');
    expect(container.textContent).toContain('Falta completar: Horários.');
  });

  async function mountComplete() {
    mocks.fetchStoreSetup.mockResolvedValue(completeSetup());
    mocks.fetchStoreHours.mockResolvedValue({ shifts: [{ dayOfWeek: 'monday', opensAtMinutes: 60 * 18, closesAtMinutes: 60 * 23 }] });
    mocks.fetchDeliveryZones.mockResolvedValue([ZONE]);
    mocks.fetchCategories.mockResolvedValue([{ id: 'cat-1', name: 'Carnes', sortOrder: 0, visible: true }]);
    mocks.fetchProducts.mockResolvedValue([
      { id: 'prod-1', categoryId: 'cat-1', name: 'Picanha', description: null, basePriceCents: 9500, sortOrder: 0, available: true },
    ]);
    await mount();
  }

  it('tudo completo mas ainda não publicada: badge 5/5, "Pronta pra publicar", CTA "Publicar minha loja"', async () => {
    await mountComplete();

    expect(container.textContent).toContain('5/5');
    expect(container.textContent).toContain('Pronta pra publicar');
    expect(container.textContent).toContain('falta só publicar');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Publicar minha loja')).toBe(true);
    expect([...container.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Ir para pedidos')).toBe(false);
  });

  it('clicar "Publicar minha loja" chama a API e abre a tela de compartilhamento', async () => {
    await mountComplete();
    mocks.publishStore.mockResolvedValue({ ...completeSetup(), onboardedAt: '2026-09-03T12:00:00.000Z' });

    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Publicar minha loja')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.publishStore).toHaveBeenCalledWith(STORE.id);
    // MoSheet monta em portal (document.body), fora de `container`.
    expect(document.body.textContent).toContain('Sua loja está no ar!');
    expect(container.textContent).toContain('Loja publicada');
  });

  it('já publicada (onboardedAt setado): "Loja publicada", CTA "Ir para pedidos" e "Compartilhar"', async () => {
    mocks.fetchStoreSetup.mockResolvedValue({ ...completeSetup(), onboardedAt: '2026-09-03T12:00:00.000Z' });
    mocks.fetchStoreHours.mockResolvedValue({ shifts: [{ dayOfWeek: 'monday', opensAtMinutes: 60 * 18, closesAtMinutes: 60 * 23 }] });
    mocks.fetchDeliveryZones.mockResolvedValue([ZONE]);
    mocks.fetchCategories.mockResolvedValue([{ id: 'cat-1', name: 'Carnes', sortOrder: 0, visible: true }]);
    mocks.fetchProducts.mockResolvedValue([
      { id: 'prod-1', categoryId: 'cat-1', name: 'Picanha', description: null, basePriceCents: 9500, sortOrder: 0, available: true },
    ]);
    await mount();

    expect(container.textContent).toContain('Loja publicada');
    expect(container.textContent).toContain('No ar e recebendo clientes.');
    expect([...container.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Ir para pedidos')).toBe(true);
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.trim().includes('Compartilhar'))).toBe(true);
  });

  it('cardápio incompleto: CTA "Completar Cardápio" leva pra /gestor/cardapio (aba própria)', async () => {
    mocks.fetchStoreSetup.mockResolvedValue(completeSetup());
    mocks.fetchStoreHours.mockResolvedValue({ shifts: [{ dayOfWeek: 'monday', opensAtMinutes: 60 * 18, closesAtMinutes: 60 * 23 }] });
    mocks.fetchDeliveryZones.mockResolvedValue([ZONE]);
    mocks.fetchCategories.mockResolvedValue([]);
    await mount();

    const link = [...container.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Completar Cardápio');
    expect(link?.getAttribute('href')).toBe('/gestor/cardapio');
  });

  it('com tenantSlug na sessão: mostra o link do domínio da loja', async () => {
    mocks.getStaffSession.mockReturnValue({ accessToken: 't', tenantId: 'tenant-1', userId: 'u1', tenantName: 'Cabanhas', tenantSlug: 'cabanhas-bbq' });
    mocks.fetchStoreSetup.mockResolvedValue(incompleteSetup());
    await mount();

    const link = [...container.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'molho.live/cabanhas-bbq');
    expect(link?.getAttribute('href')).toBe('https://molho.vercel.app/cabanhas-bbq');
  });

  it('sem tenantSlug (sessão antiga): não mostra link de domínio quebrado', async () => {
    mocks.fetchStoreSetup.mockResolvedValue(incompleteSetup());
    await mount();

    expect(container.textContent).not.toContain('molho.live/');
  });

  it('salvar a loja com nome novo atualiza o link de domínio na hora, sem precisar relogar', async () => {
    sessionState = { accessToken: 't', tenantId: 'tenant-1', userId: 'u1', tenantName: 'Cabanhas', tenantSlug: 'cabanhas-bbq' };
    mocks.fetchStoreSetup.mockResolvedValue(incompleteSetup());
    mocks.saveStoreSetup.mockResolvedValue({ ...incompleteSetup(), name: 'Cabanhas Churrasco', tenantSlug: 'cabanhas-churrasco' });
    await mount();

    expect([...container.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'molho.live/cabanhas-bbq')).toBe(true);

    const nameInput = [...container.querySelectorAll('label')]
      .find((el) => el.querySelector('span')?.textContent?.trim() === 'Nome fantasia')
      ?.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(nameInput, 'Cabanhas Churrasco');
      nameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Salvar loja')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect([...container.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'molho.live/cabanhas-churrasco')).toBe(true);
  });
});

describe('ConfiguracaoPage — modal de horários (estilo iFood)', () => {
  it('abre pelo botão, liga um dia pelo círculo, e "Concluir" salva e fecha', async () => {
    mocks.fetchStoreSetup.mockResolvedValue(incompleteSetup());
    mocks.saveStoreHours.mockImplementation(async (_storeId: string, body: { shifts: unknown[] }) => body);
    await mount();

    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Editar horários')?.click();
    });
    // MoSheet monta em portal (document.body), fora de `container`.
    expect(document.body.textContent).toContain('Nenhum dia ligado ainda');

    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('[aria-label^="Segunda:"]')?.click();
    });
    expect(document.body.textContent).toContain('Segunda-feira');

    await act(async () => {
      [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Concluir')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.saveStoreHours).toHaveBeenCalledWith(
      STORE.id,
      expect.objectContaining({ shifts: expect.arrayContaining([expect.objectContaining({ dayOfWeek: 'monday', opensAtMinutes: 18 * 60, closesAtMinutes: 23 * 60 })]) }),
    );
    // sheet fecha depois de salvar
    expect(document.body.textContent).not.toContain('Nenhum dia ligado ainda');
  });

  it('clicar de novo no círculo desliga o dia (limpa os turnos)', async () => {
    mocks.fetchStoreSetup.mockResolvedValue(incompleteSetup());
    await mount();

    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Editar horários')?.click();
    });
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('[aria-label^="Segunda:"]')?.click();
    });
    expect(document.body.textContent).toContain('Segunda-feira');

    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('[aria-label^="Segunda:"]')?.click();
    });
    expect(document.body.textContent).not.toContain('Segunda-feira');
  });
});
