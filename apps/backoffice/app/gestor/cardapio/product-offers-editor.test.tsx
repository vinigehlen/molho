import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, Product, ProductOffer } from '../../../lib/catalog-api';
import { ProductOffersEditor } from './product-offers-editor';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocks = vi.hoisted(() => ({
  fetchProductOffers: vi.fn(),
  createProductOffer: vi.fn(),
  updateProductOffer: vi.fn(),
  setProductOfferAvailability: vi.fn(),
  deleteProductOffer: vi.fn(),
}));

vi.mock('../../../lib/catalog-api', () => ({
  fetchProductOffers: mocks.fetchProductOffers,
  createProductOffer: mocks.createProductOffer,
  updateProductOffer: mocks.updateProductOffer,
  setProductOfferAvailability: mocks.setProductOfferAvailability,
  deleteProductOffer: mocks.deleteProductOffer,
}));

const PRODUCT: Product = {
  id: 'product-1',
  categoryId: 'category-1',
  name: 'X-Burger',
  description: null,
  basePriceCents: 2890,
  imageKey: null,
  available: true,
  pdvCode: '101',
  sortOrder: 0,
  version: 0,
};

const CATEGORIES: Category[] = [
  { id: 'category-1', name: 'Hambúrgueres', sortOrder: 0, visible: true, version: 0 },
  { id: 'category-2', name: 'Destaques', sortOrder: 1, visible: true, version: 0 },
  { id: 'category-3', name: 'Mais pedidos', sortOrder: 2, visible: true, version: 0 },
];

const PRIMARY: ProductOffer = {
  id: 'offer-1',
  productId: PRODUCT.id,
  categoryId: 'category-1',
  priceCents: 2890,
  available: true,
  pdvCode: '101',
  sortOrder: 0,
  isPrimary: true,
  version: 0,
};

const SECONDARY: ProductOffer = {
  ...PRIMARY,
  id: 'offer-2',
  categoryId: 'category-2',
  priceCents: 2590,
  isPrimary: false,
};

const PRIMARY_DRAFT = {
  categoryId: PRODUCT.categoryId,
  price: 'R$ 28,90',
  pdvCode: '101',
};

let container: HTMLDivElement;
let root: Root;

async function mount(offers: ProductOffer[] = [PRIMARY]) {
  mocks.fetchProductOffers.mockResolvedValue(offers);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ProductOffersEditor
        product={PRODUCT}
        categories={CATEGORIES}
        primaryDraft={PRIMARY_DRAFT}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(label: string) {
  await act(async () => {
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === label)
      ?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createProductOffer.mockResolvedValue(SECONDARY);
  mocks.updateProductOffer.mockImplementation(async (_offer, input) => ({
    ...SECONDARY,
    ...input,
    version: 1,
  }));
  mocks.setProductOfferAvailability.mockResolvedValue({
    ...SECONDARY,
    available: false,
    version: 1,
  });
  mocks.deleteProductOffer.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('ProductOffersEditor', () => {
  it('cria uma apresentação secundária preservando a oferta principal', async () => {
    await mount();

    expect(container.textContent).toContain('Hambúrgueres');
    expect(container.textContent).toContain('Principal');
    await click('Adicionar em outra categoria');
    await click('Adicionar nesta categoria');

    expect(mocks.createProductOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'product-1',
        categoryId: 'category-2',
        priceCents: 2890,
        sortOrder: 0,
      }),
    );
    expect(container.textContent).toContain('Destaques');
    expect(container.textContent).toContain('Item adicionado em mais uma categoria.');
  });

  it('pausa e remove apenas a apresentação secundária', async () => {
    await mount([PRIMARY, SECONDARY]);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Marcar como esgotado em Destaques"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.setProductOfferAvailability).toHaveBeenCalledWith(SECONDARY, false);
    expect(container.textContent).toContain('Esgotado');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Remover apresentação em Destaques"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.deleteProductOffer).not.toHaveBeenCalled();
    expect(container.textContent).toContain('O item continua disponível nas outras categorias.');

    await click('Remover categoria');
    expect(mocks.deleteProductOffer).toHaveBeenCalled();
    expect(container.textContent).not.toContain('Apresentação independente');
    expect(container.textContent).toContain('Principal');
  });

  it('persiste a ordem editada da apresentação secundária', async () => {
    await mount([PRIMARY, SECONDARY]);
    const orderInput = container.querySelector<HTMLInputElement>(
      '[aria-label="Ordem em Destaques"]',
    );

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        orderInput,
        '7',
      );
      orderInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Salvar apresentação');

    expect(mocks.updateProductOffer).toHaveBeenCalledWith(
      SECONDARY,
      expect.objectContaining({ sortOrder: 7 }),
    );
  });

  it('mostra a categoria, o preço e o PDV ainda não salvos do item principal', async () => {
    mocks.fetchProductOffers.mockResolvedValue([PRIMARY]);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <ProductOffersEditor
          product={PRODUCT}
          categories={CATEGORIES}
          primaryDraft={{ categoryId: 'category-3', price: '31,50', pdvCode: ' 202 ' }}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Mais pedidos');
    expect(container.textContent).toMatch(/R\$\s31,50 · PDV 202/);
  });
});
