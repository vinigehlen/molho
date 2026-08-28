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
  fetchStoreHours: vi.fn(),
  saveStoreHours: vi.fn(),
  fetchDeliveryZones: vi.fn(),
  createDeliveryZone: vi.fn(),
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
  fetchProductImages: vi.fn(),
  reorderProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
}));

vi.mock('../../../lib/staff-session', () => ({ getStaffSession: mocks.getStaffSession, setStaffSession: mocks.setStaffSession }));
vi.mock('../../../lib/my-stores-api', () => ({ fetchMyStores: mocks.fetchMyStores }));
vi.mock('../../../lib/store-setup-api', () => ({
  fetchStoreSetup: mocks.fetchStoreSetup,
  saveStoreSetup: mocks.saveStoreSetup,
}));
vi.mock('../../../lib/store-hours-api', () => ({
  fetchStoreHours: mocks.fetchStoreHours,
  saveStoreHours: mocks.saveStoreHours,
}));
vi.mock('../../../lib/delivery-zones-api', () => ({
  fetchDeliveryZones: mocks.fetchDeliveryZones,
  createDeliveryZone: mocks.createDeliveryZone,
}));
vi.mock('../../../lib/catalog-api', () => ({
  fetchCategories: mocks.fetchCategories,
  fetchProducts: mocks.fetchProducts,
  fetchModifierGroups: vi.fn().mockResolvedValue([]),
  fetchModifiers: vi.fn().mockResolvedValue([]),
  fetchProductImages: mocks.fetchProductImages,
  reorderProductImage: mocks.reorderProductImage,
  deleteProductImage: mocks.deleteProductImage,
  createCategory: vi.fn(),
  createModifier: vi.fn(),
  createModifierGroup: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  downloadCatalogTemplate: vi.fn(),
  importCatalog: vi.fn(),
  setProductAvailability: vi.fn(),
  updateProduct: vi.fn(),
  uploadProductImage: vi.fn(),
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
    addressText: '',
    phone: null,
    whatsappNumber: null,
    minOrderCents: 0,
    pixKey: null,
    pixKeyType: null,
    pixMerchantCity: null,
    timezone: 'America/Sao_Paulo',
  };
}

function completeSetup() {
  return {
    ...incompleteSetup(),
    cnpj: '12.345.678/0001-90',
    ownerName: 'Maria',
    name: 'Cabanhas BBQ',
    addressText: 'Rua das Carnes, 100',
    phone: '5199999999',
    whatsappNumber: '5199999999',
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
  mocks.fetchProductImages.mockResolvedValue([]);
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
    mocks.fetchStoreSetup.mockResolvedValue({ ...incompleteSetup(), name: 'Cabanhas', addressText: 'Rua X', phone: '51999999999', whatsappNumber: '51999999999', cnpj: '12.345.678/0001-90' });
    await mount();

    expect(container.textContent).toContain('1/5');
    expect(container.textContent).toContain('Falta completar: Horários.');
  });

  it('tudo completo: badge 5/5, "Loja pronta", CTA "Ir para pedidos"', async () => {
    mocks.fetchStoreSetup.mockResolvedValue(completeSetup());
    mocks.fetchStoreHours.mockResolvedValue({ shifts: [{ dayOfWeek: 'monday', opensAtMinutes: 60 * 18, closesAtMinutes: 60 * 23 }] });
    mocks.fetchDeliveryZones.mockResolvedValue([ZONE]);
    mocks.fetchCategories.mockResolvedValue([{ id: 'cat-1', name: 'Carnes', sortOrder: 0, visible: true }]);
    mocks.fetchProducts.mockResolvedValue([
      { id: 'prod-1', categoryId: 'cat-1', name: 'Picanha', description: null, basePriceCents: 9500, sortOrder: 0, available: true },
    ]);
    await mount();

    expect(container.textContent).toContain('5/5');
    expect(container.textContent).toContain('Loja pronta');
    expect(container.textContent).toContain('Já pode receber clientes.');
    expect([...container.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Ir para pedidos')).toBe(true);
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

describe('ConfiguracaoPage — galeria de fotos do produto', () => {
  const IMG_A = { id: 'img-a', productId: 'prod-1', imageKey: 'a.jpg', imageUrl: 'https://cdn/a.jpg', position: 0, version: 0 };
  const IMG_B = { id: 'img-b', productId: 'prod-1', imageKey: 'b.jpg', imageUrl: 'https://cdn/b.jpg', position: 1, version: 0 };

  async function openProductGallery() {
    mocks.fetchStoreSetup.mockResolvedValue(incompleteSetup());
    mocks.fetchCategories.mockResolvedValue([{ id: 'cat-1', name: 'Carnes', sortOrder: 0, visible: true }]);
    mocks.fetchProducts.mockResolvedValue([
      { id: 'prod-1', categoryId: 'cat-1', name: 'Picanha', description: null, basePriceCents: 9500, sortOrder: 0, available: true },
    ]);
    mocks.fetchProductImages.mockResolvedValue([IMG_A, IMG_B]);
    await mount();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Editar')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('marca a primeira foto (menor position) como Capa', async () => {
    await openProductGallery();
    expect(container.textContent).toContain('Capa');
  });

  it('"Mover pra baixo" na capa troca as positions (A vira 1, B vira 0)', async () => {
    mocks.reorderProductImage.mockImplementation(async (_productId: string, image: typeof IMG_A, position: number) => ({ ...image, position, version: image.version + 1 }));
    await openProductGallery();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Mover pra baixo"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.reorderProductImage).toHaveBeenCalledWith('prod-1', IMG_A, 1);
    expect(mocks.reorderProductImage).toHaveBeenCalledWith('prod-1', IMG_B, 0);
  });

  it('remover foto pede o id/version certos e tira da lista', async () => {
    mocks.deleteProductImage.mockResolvedValue(undefined);
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      await openProductGallery();
      const [deleteButton] = container.querySelectorAll<HTMLButtonElement>('[aria-label="Remover foto"]');

      await act(async () => {
        deleteButton.click();
        await Promise.resolve();
      });

      expect(mocks.deleteProductImage).toHaveBeenCalledWith('prod-1', IMG_A);
      expect(container.textContent).toContain('Foto removida.');
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
