import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CardapioPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getStaffSession: vi.fn(),
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
  fetchProductImages: vi.fn(),
  reorderProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  setProductAvailability: vi.fn(),
}));

vi.mock('../../../lib/staff-session', () => ({ getStaffSession: mocks.getStaffSession }));
vi.mock('../../../lib/catalog-api', () => ({
  fetchCategories: mocks.fetchCategories,
  fetchProducts: mocks.fetchProducts,
  fetchModifierGroups: vi.fn().mockResolvedValue([]),
  fetchModifiers: vi.fn().mockResolvedValue([]),
  fetchProductImages: mocks.fetchProductImages,
  reorderProductImage: mocks.reorderProductImage,
  deleteProductImage: mocks.deleteProductImage,
  setProductAvailability: mocks.setProductAvailability,
  createCategory: vi.fn(),
  createModifier: vi.fn(),
  createModifierGroup: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  downloadCatalogTemplate: vi.fn(),
  importCatalog: vi.fn(),
  updateProduct: vi.fn(),
  uploadProductImage: vi.fn(),
}));

const CATEGORY = { id: 'cat-1', name: 'Carnes', sortOrder: 0, visible: true };
const PICANHA = { id: 'prod-1', categoryId: 'cat-1', name: 'Picanha', description: null, basePriceCents: 9500, sortOrder: 0, available: true };
const COSTELA = { id: 'prod-2', categoryId: 'cat-1', name: 'Costela', description: null, basePriceCents: 7600, sortOrder: 1, available: true };
const IMG_A = { id: 'img-a', productId: 'prod-1', imageKey: 'a.jpg', imageUrl: 'https://cdn/a.jpg', position: 0, version: 0 };
const IMG_B = { id: 'img-b', productId: 'prod-1', imageKey: 'b.jpg', imageUrl: 'https://cdn/b.jpg', position: 1, version: 0 };

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CardapioPage />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStaffSession.mockReturnValue({ accessToken: 't', tenantId: 'tenant-1', userId: 'u1', tenantName: 'Cabanhas' });
  mocks.fetchCategories.mockResolvedValue([CATEGORY]);
  mocks.fetchProducts.mockResolvedValue([PICANHA, COSTELA]);
  mocks.fetchProductImages.mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function openGallery() {
  mocks.fetchProductImages.mockResolvedValue([IMG_A, IMG_B]);
  await mount();
  // A página auto-seleciona o primeiro produto (Picanha) ao carregar, então
  // a linha já nasce expandida ("Fechar", não "Editar") — achar o botão
  // DENTRO da linha da Picanha evita pegar o "Editar" da Costela por engano.
  await act(async () => {
    const row = [...container.querySelectorAll('.rounded-\\[14px\\]')].find((el) => el.textContent?.includes('Picanha'));
    const toggle = [...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === 'Editar' || b.textContent?.trim() === 'Fechar');
    if (toggle?.textContent?.trim() === 'Editar') toggle.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CardapioPage — busca e status rápido', () => {
  it('busca filtra a lista pelo nome', async () => {
    await mount();
    expect(container.textContent).toContain('Picanha');
    expect(container.textContent).toContain('Costela');

    const search = container.querySelector<HTMLInputElement>('[aria-label="Buscar item pelo nome"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(search, 'Pica');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('Picanha');
    expect(container.textContent).not.toContain('Costela');
  });

  it('toggle de status na linha (sem abrir o item) chama setProductAvailability', async () => {
    mocks.setProductAvailability.mockResolvedValue({ ...PICANHA, available: false });
    await mount();

    const statusButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'ativo');
    await act(async () => {
      statusButton?.click();
      await Promise.resolve();
    });

    expect(mocks.setProductAvailability).toHaveBeenCalledWith(PICANHA, false);
  });
});

describe('CardapioPage — galeria de fotos do produto', () => {
  it('marca a primeira foto (menor position) como Capa', async () => {
    await openGallery();
    expect(container.textContent).toContain('Capa');
  });

  it('"Mover pra baixo" na capa troca as positions (A vira 1, B vira 0)', async () => {
    mocks.reorderProductImage.mockImplementation(async (_productId: string, image: typeof IMG_A, position: number) => ({ ...image, position, version: image.version + 1 }));
    await openGallery();

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
      await openGallery();
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
