import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CardapioPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocks = vi.hoisted(() => ({
  getStaffSession: vi.fn(),
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
  fetchProductImages: vi.fn(),
  fetchProductOffers: vi.fn(),
  fetchAllModifierGroups: vi.fn(),
  fetchModifierGroups: vi.fn(),
  linkModifierGroupToProduct: vi.fn(),
  reorderProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  setProductAvailability: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  uploadProductImage: vi.fn(),
  createProductOffer: vi.fn(),
  updateProductOffer: vi.fn(),
  setProductOfferAvailability: vi.fn(),
  deleteProductOffer: vi.fn(),
}));

vi.mock('../../../lib/staff-session', () => ({ getStaffSession: mocks.getStaffSession }));
vi.mock('../../../lib/catalog-api', () => ({
  fetchCategories: mocks.fetchCategories,
  fetchProducts: mocks.fetchProducts,
  fetchModifierGroups: mocks.fetchModifierGroups,
  fetchAllModifierGroups: mocks.fetchAllModifierGroups,
  fetchModifiers: vi.fn().mockResolvedValue([]),
  fetchProductImages: mocks.fetchProductImages,
  fetchProductOffers: mocks.fetchProductOffers,
  reorderProductImage: mocks.reorderProductImage,
  deleteProductImage: mocks.deleteProductImage,
  setProductAvailability: mocks.setProductAvailability,
  setModifierGroupActive: vi.fn(),
  linkModifierGroupToProduct: mocks.linkModifierGroupToProduct,
  unlinkModifierGroupFromProduct: vi.fn(),
  createCategory: vi.fn(),
  createModifier: vi.fn(),
  createModifierGroup: vi.fn(),
  createProduct: mocks.createProduct,
  deleteProduct: vi.fn(),
  downloadCatalogTemplate: vi.fn(),
  updateProduct: mocks.updateProduct,
  uploadProductImage: mocks.uploadProductImage,
  createProductOffer: mocks.createProductOffer,
  updateProductOffer: mocks.updateProductOffer,
  setProductOfferAvailability: mocks.setProductOfferAvailability,
  deleteProductOffer: mocks.deleteProductOffer,
}));

const CATEGORY = { id: 'cat-1', name: 'Carnes', sortOrder: 0, visible: true, version: 0 };
const PICANHA = {
  id: 'prod-1',
  categoryId: 'cat-1',
  name: 'Picanha',
  description: 'Na brasa com fritas',
  basePriceCents: 9500,
  imageKey: null,
  pdvCode: '101',
  sortOrder: 0,
  available: true,
  version: 0,
};
const COSTELA = {
  id: 'prod-2',
  categoryId: 'cat-1',
  name: 'Costela',
  description: 'Assada lentamente',
  basePriceCents: 7600,
  imageKey: null,
  pdvCode: '202',
  sortOrder: 1,
  available: false,
  version: 0,
};
const IMG_A = {
  id: 'img-a',
  productId: 'prod-1',
  imageKey: 'a.jpg',
  imageUrl: 'https://cdn/a.jpg',
  position: 0,
  version: 0,
};
const IMG_B = {
  id: 'img-b',
  productId: 'prod-1',
  imageKey: 'b.jpg',
  imageUrl: 'https://cdn/b.jpg',
  position: 1,
  version: 0,
};

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
  mocks.getStaffSession.mockReturnValue({
    accessToken: 't',
    tenantId: 'tenant-1',
    userId: 'u1',
    tenantName: 'Cabanhas',
  });
  mocks.fetchCategories.mockResolvedValue([CATEGORY]);
  mocks.fetchProducts.mockResolvedValue([PICANHA, COSTELA]);
  mocks.fetchProductImages.mockResolvedValue([]);
  mocks.fetchProductOffers.mockResolvedValue([
    {
      id: 'offer-primary',
      productId: 'prod-1',
      categoryId: 'cat-1',
      priceCents: 9500,
      available: true,
      pdvCode: '101',
      sortOrder: 0,
      isPrimary: true,
      version: 0,
    },
  ]);
  mocks.fetchAllModifierGroups.mockResolvedValue([]);
  mocks.fetchModifierGroups.mockResolvedValue([]);
  mocks.createProduct.mockResolvedValue({ ...PICANHA, id: 'prod-new', name: 'Xis coração' });
  mocks.updateProduct.mockResolvedValue({ ...PICANHA, version: 1 });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function openGallery() {
  mocks.fetchProductImages.mockResolvedValue([IMG_A, IMG_B]);
  await mount();
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[aria-label="Editar Picanha"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
  await goToReviewStep();
}

function visibleProductNames() {
  return [...container.querySelectorAll<HTMLElement>('[data-product-id]')].map(
    (row) => row.textContent ?? '',
  );
}

async function openProduct(name: string) {
  await act(async () => {
    const trigger = container.querySelector<HTMLButtonElement>(`[aria-label="Editar ${name}"]`);
    trigger?.focus();
    trigger?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickButton(label: string) {
  await act(async () => {
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === label)
      ?.click();
    await Promise.resolve();
  });
}

async function goToReviewStep() {
  await clickButton('Continuar');
  await clickButton('Continuar');
}

async function setInputValue(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('CardapioPage — busca e status rápido', () => {
  it('busca filtra a lista pelo nome', async () => {
    await mount();
    expect(container.textContent).toContain('Picanha');
    expect(container.textContent).toContain('Costela');

    const search = container.querySelector<HTMLInputElement>('[aria-label="Buscar item"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(search, 'Pica');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(visibleProductNames()).toHaveLength(1);
    expect(visibleProductNames()[0]).toContain('Picanha');
  });

  it('busca também encontra descrição e código do PDV', async () => {
    await mount();
    const search = container.querySelector<HTMLInputElement>('[aria-label="Buscar item"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    await act(async () => {
      setter?.call(search, '202');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(visibleProductNames()).toHaveLength(1);
    expect(visibleProductNames()[0]).toContain('Costela');
  });

  it('filtro de status mostra somente os itens esgotados', async () => {
    await mount();
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Esgotados')
        ?.click();
    });

    expect(visibleProductNames()).toHaveLength(1);
    expect(visibleProductNames()[0]).toContain('Costela');
  });

  it('toggle de status na linha (sem abrir o item) chama setProductAvailability', async () => {
    mocks.setProductAvailability.mockResolvedValue({ ...PICANHA, available: false });
    await mount();

    const statusButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Marcar como esgotado: Picanha"]',
    );
    await act(async () => {
      statusButton?.click();
      await Promise.resolve();
    });

    expect(mocks.setProductAvailability).toHaveBeenCalledWith(PICANHA, false);
  });
});

describe('CardapioPage — workspace operacional', () => {
  it('filtra a lista pela categoria escolhida e mantém os contadores', async () => {
    const BEBIDAS = { id: 'cat-2', name: 'Bebidas', sortOrder: 1, visible: true, version: 0 };
    const SUCO = {
      ...PICANHA,
      id: 'prod-3',
      categoryId: 'cat-2',
      name: 'Suco de laranja',
      pdvCode: '303',
    };
    mocks.fetchCategories.mockResolvedValue([CATEGORY, BEBIDAS]);
    mocks.fetchProducts.mockImplementation(async (categoryId: string) =>
      categoryId === 'cat-1' ? [PICANHA, COSTELA] : [SUCO],
    );
    await mount();

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')]
        .find((button) => button.textContent?.includes('Bebidas'))
        ?.click();
    });

    expect(visibleProductNames()).toHaveLength(1);
    expect(visibleProductNames()[0]).toContain('Suco de laranja');
    expect(container.textContent).toContain('3itens');
  });

  it('abre o cadastro guiado pelo comando principal', async () => {
    await mount();
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Novo item'))
        ?.click();
    });

    expect(container.textContent).toContain('Etapa 1 de 3');
    expect(container.textContent).toContain('Conte o básico');
    expect(container.querySelector('[aria-label="Nome do produto"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Preço do produto"]')).toBeNull();
  });

  it('leva o foco ao editor e fecha com Escape em telas compactas', async () => {
    await mount();
    await openProduct('Picanha');
    const editor = container.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Editar Picanha"]',
    );

    expect(editor).not.toBeNull();
    expect(editor?.tagName).toBe('DIALOG');
    expect(document.activeElement).toBe(editor);
    await act(async () => {
      editor?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"][aria-label="Editar Picanha"]')).toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Editar Picanha');
  });

  it('mostra convite acionável quando o cardápio ainda está vazio', async () => {
    mocks.fetchProducts.mockResolvedValue([]);
    await mount();

    expect(container.textContent).toContain('Nenhum prato por aqui ainda');
    expect(
      [...container.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Cadastrar primeiro item'),
      ),
    ).toBe(true);
  });
});

describe('CardapioPage — fluxo guiado de cadastro e edição', () => {
  it('bloqueia o avanço até preencher cada etapa obrigatória', async () => {
    await mount();
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Novo item'))
        ?.click();
    });

    const detailsContinue = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Continuar',
    );
    expect(detailsContinue?.disabled).toBe(true);
    expect(container.textContent).toContain('Escolha a categoria e dê um nome');

    await setInputValue('[aria-label="Nome do produto"]', 'Xis coração');
    expect(detailsContinue?.disabled).toBe(false);
    await clickButton('Continuar');

    const saleContinue = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Continuar',
    );
    expect(saleContinue?.disabled).toBe(true);
    expect(container.textContent).toContain('Informe o preço para seguir');
  });

  it('preserva o rascunho ao voltar e cria o item somente na revisão final', async () => {
    const created = {
      ...PICANHA,
      id: 'prod-new',
      name: 'Xis coração',
      description: 'Com queijo e coração',
      basePriceCents: 2990,
      pdvCode: '1042',
    };
    mocks.createProduct.mockResolvedValue(created);
    mocks.fetchProducts
      .mockResolvedValueOnce([PICANHA, COSTELA])
      .mockResolvedValue([PICANHA, COSTELA, created]);
    await mount();
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Novo item'))
        ?.click();
    });

    await setInputValue('[aria-label="Nome do produto"]', 'Xis coração');
    await setInputValue('[aria-label="Descrição do produto"]', 'Com queijo e coração');
    await clickButton('Continuar');
    await setInputValue('[aria-label="Preço do produto"]', '29,90');
    await setInputValue('[aria-label="Código no PDV"]', '1042');
    await clickButton('Voltar');

    expect(container.querySelector<HTMLInputElement>('[aria-label="Nome do produto"]')?.value).toBe(
      'Xis coração',
    );
    await clickButton('Continuar');
    await clickButton('Continuar');

    expect(container.textContent).toContain('Revise antes de publicar');
    expect(container.textContent).toContain('Xis coração');
    expect(container.textContent).toContain('R$ 29,90');
    expect(mocks.createProduct).not.toHaveBeenCalled();
    await clickButton('Adicionar ao cardápio');

    expect(mocks.createProduct).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      name: 'Xis coração',
      description: 'Com queijo e coração',
      basePriceCents: 2990,
      pdvCode: '1042',
      sortOrder: 2,
    });
  });

  it('edita dados pelo mesmo fluxo e salva na etapa de revisão', async () => {
    const updated = { ...PICANHA, basePriceCents: 9990, version: 1 };
    mocks.updateProduct.mockResolvedValue(updated);
    mocks.fetchProducts
      .mockResolvedValueOnce([PICANHA, COSTELA])
      .mockResolvedValue([updated, COSTELA]);
    await mount();
    await openProduct('Picanha');
    await clickButton('Continuar');
    await setInputValue('[aria-label="Preço do item"]', '99,90');
    await clickButton('Continuar');

    expect(container.textContent).toContain('Revise as alterações');
    expect(container.textContent).toContain('R$ 99,90');
    await clickButton('Salvar alterações');

    expect(mocks.updateProduct).toHaveBeenCalledWith(PICANHA, {
      categoryId: 'cat-1',
      name: 'Picanha',
      description: 'Na brasa com fritas',
      basePriceCents: 9990,
      pdvCode: '101',
    });
  });

  it('mostra a prévia da foto escolhida antes de publicar', async () => {
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:foto-preview'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    try {
      await mount();
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent?.includes('Novo item'))
          ?.click();
      });
      await setInputValue('[aria-label="Nome do produto"]', 'Xis coração');
      await clickButton('Continuar');
      await setInputValue('[aria-label="Preço do produto"]', '29,90');
      await clickButton('Continuar');

      const photo = new File(['foto'], 'xis-coracao.png', { type: 'image/png' });
      const input = container.querySelector<HTMLInputElement>('[aria-label="Foto do produto"]');
      Object.defineProperty(input, 'files', { configurable: true, value: [photo] });
      await act(async () => {
        input?.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
      });

      const preview = container.querySelector<HTMLImageElement>(
        '[alt="Prévia de xis-coracao.png"]',
      );
      expect(preview?.getAttribute('src')).toBe('blob:foto-preview');
      expect(container.textContent).toContain('xis-coracao.png');
    } finally {
      if (originalCreateObjectUrl) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: originalCreateObjectUrl,
        });
      } else delete (URL as { createObjectURL?: unknown }).createObjectURL;
      if (originalRevokeObjectUrl) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: originalRevokeObjectUrl,
        });
      } else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });

  it('anuncia erro de publicação dentro do editor fullscreen', async () => {
    mocks.createProduct.mockRejectedValue(new Error('Não foi possível publicar agora.'));
    await mount();
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Novo item'))
        ?.click();
    });
    await setInputValue('[aria-label="Nome do produto"]', 'Xis coração');
    await clickButton('Continuar');
    await setInputValue('[aria-label="Preço do produto"]', '29,90');
    await clickButton('Continuar');
    await clickButton('Adicionar ao cardápio');

    const editor = container.querySelector('[role="dialog"][aria-label="Cadastrar novo item"]');
    expect(editor?.querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível publicar agora.',
    );
  });
});

describe('CardapioPage — galeria de fotos do produto', () => {
  it('marca a primeira foto (menor position) como Capa', async () => {
    await openGallery();
    expect(container.textContent).toContain('Capa');
  });

  it('"Mover pra baixo" na capa troca as positions (A vira 1, B vira 0)', async () => {
    mocks.reorderProductImage.mockImplementation(
      async (_productId: string, image: typeof IMG_A, position: number) => ({
        ...image,
        position,
        version: image.version + 1,
      }),
    );
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
      const [deleteButton] = container.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Remover foto"]',
      );
      expect(deleteButton).toBeDefined();

      await act(async () => {
        deleteButton?.click();
        await Promise.resolve();
      });

      expect(mocks.deleteProductImage).toHaveBeenCalledWith('prod-1', IMG_A);
      expect(container.textContent).toContain('Foto removida.');
    } finally {
      window.confirm = originalConfirm;
    }
  });
});

describe('CardapioPage — reuso de grupo de complemento (fase 2/4)', () => {
  const MOLHOS = {
    id: 'mg-1',
    productId: 'prod-2',
    productIds: ['prod-2'],
    productNames: ['Costela'],
    name: 'Molhos',
    min: 0,
    max: 3,
    active: true,
    pdvCode: null,
    version: 0,
  };

  it('oferece "vincular grupo existente" só com grupo de OUTRO produto disponível', async () => {
    mocks.fetchAllModifierGroups.mockResolvedValue([MOLHOS]);
    await mount();
    await openProduct('Picanha');
    await goToReviewStep();

    // Picanha ainda não tem "Molhos" vinculado.
    expect(container.textContent).toContain('Vincular grupo existente');
    const option = [...container.querySelectorAll('option')].find((o) =>
      o.textContent?.includes('Molhos'),
    );
    expect(option?.textContent).toContain('Costela');
  });

  it('vincular chama linkModifierGroupToProduct e recarrega os grupos do produto', async () => {
    mocks.fetchAllModifierGroups.mockResolvedValue([MOLHOS]);
    mocks.linkModifierGroupToProduct.mockResolvedValue(undefined);
    mocks.fetchModifierGroups.mockResolvedValue([{ ...MOLHOS, productId: 'prod-1' }]);
    await mount();
    await openProduct('Picanha');
    await goToReviewStep();

    const selectWithMolhos = [...container.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => o.textContent?.includes('Molhos')),
    );
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(selectWithMolhos, 'mg-1');
      selectWithMolhos?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent?.trim() === 'Vincular')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.linkModifierGroupToProduct).toHaveBeenCalledWith('mg-1', 'prod-1');
    expect(container.textContent).toContain('Grupo vinculado.');
  });
});

describe('CardapioPage — importação', () => {
  it('CTA "Importar cardápio" aponta para a rota assistida', async () => {
    await mount();
    const cta = [...container.querySelectorAll('a')].find((a) => a.textContent?.includes('Importar cardápio'));
    expect(cta?.getAttribute('href')).toBe('/gestor/cardapio/importar');
  });

  it('mantém o botão "Baixar modelo"', async () => {
    await mount();
    const baixar = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Baixar modelo'));
    expect(baixar).toBeDefined();
  });

  it('não há mais input que importe planilha direto', async () => {
    await mount();
    expect(container.querySelector('input[type="file"][accept=".csv,.xlsx"]')).toBeNull();
  });
});
