import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BalcaoPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({ usePathname: () => '/gestor/balcao' }));

// CashSessionPanel busca caixa por conta própria (cash-session-api) — fora do
// escopo deste teste (merge de linha do carrinho), então vira um stub mudo.
vi.mock('./cash-session-panel', () => ({ CashSessionPanel: () => null }));

const mocks = vi.hoisted(() => ({
  fetchMyStores: vi.fn(),
  fetchCounterCatalog: vi.fn(),
  fetchProductModifierGroups: vi.fn(),
  fetchStoreSetup: vi.fn(),
  searchCustomers: vi.fn(),
  createCounterOrder: vi.fn(),
}));

vi.mock('../../../lib/my-stores-api', () => ({ fetchMyStores: mocks.fetchMyStores }));
vi.mock('../../../lib/store-setup-api', () => ({ fetchStoreSetup: mocks.fetchStoreSetup }));
vi.mock('../../../lib/counter-pos-api', () => ({
  fetchCounterCatalog: mocks.fetchCounterCatalog,
  fetchProductModifierGroups: mocks.fetchProductModifierGroups,
  searchCustomers: mocks.searchCustomers,
  createCounterOrder: mocks.createCounterOrder,
}));

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<BalcaoPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchMyStores.mockResolvedValue([{ id: 'store-1', name: 'Loja Central' }]);
  mocks.fetchStoreSetup.mockResolvedValue({ cashSessionRequired: false });
  mocks.searchCustomers.mockResolvedValue([]);
  mocks.fetchCounterCatalog.mockResolvedValue({
    categories: [{ id: 'cat-1', name: 'Carnes', visible: true }],
    products: [
      {
        id: 'product-1',
        categoryId: 'cat-1',
        name: 'CABANHAS BIG STEAK',
        description: null,
        basePriceCents: 3990,
        available: true,
      },
    ],
  });
  mocks.fetchProductModifierGroups.mockResolvedValue([
    {
      id: 'group-1',
      name: 'Ponto da carne',
      min: 1,
      max: 1,
      modifiers: [{ id: 'mod-ao-ponto', name: 'Ao Ponto', priceDeltaCents: 0 }],
    },
  ]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * Regressão do bug relatado: adicionar o MESMO produto (com complemento) mais
 * de uma vez pelo sheet criava uma linha de carrinho nova a cada confirmação
 * em vez de somar na linha existente — pedido saía com "1x, 1x, 1x, 1x" em
 * vez de "4x" no cartão do gestor (order-card.tsx só reflete o que veio no
 * carrinho, não agrupa por conta própria).
 */
describe('BalcaoPage — fusão de linha do carrinho', () => {
  it('soma quantidade na mesma linha ao adicionar o produto+complemento repetidas vezes pelo sheet', async () => {
    await mount();

    const addToCartTwice = async () => {
      const productButton = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('CABANHAS BIG STEAK'),
      );
      expect(productButton).toBeTruthy();
      await act(async () => {
        productButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      const radio = document.querySelector('input[type="radio"]') as HTMLInputElement | null;
      expect(radio).toBeTruthy();
      await act(async () => {
        radio!.click();
      });

      const addButton = Array.from(document.querySelectorAll('button')).find((btn) =>
        btn.textContent?.startsWith('Adicionar'),
      );
      expect(addButton).toBeTruthy();
      await act(async () => {
        addButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    };

    await addToCartTwice();
    await addToCartTwice();

    const cartLines = container.querySelectorAll('button[aria-label^="Remover "]');
    expect(cartLines.length).toBe(1);
    expect(container.querySelector('aside')?.textContent).toContain('2');
  });
});
