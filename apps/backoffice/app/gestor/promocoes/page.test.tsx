import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Promotion } from '../../../lib/promotions-api';
import PromocoesPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchPromotions: vi.fn(),
  createPromotion: vi.fn(),
  setPromotionActive: vi.fn(),
  deletePromotion: vi.fn(),
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
}));

vi.mock('../../../lib/promotions-api', () => ({
  fetchPromotions: mocks.fetchPromotions,
  createPromotion: mocks.createPromotion,
  setPromotionActive: mocks.setPromotionActive,
  deletePromotion: mocks.deletePromotion,
}));

vi.mock('../../../lib/catalog-api', () => ({
  fetchCategories: mocks.fetchCategories,
  fetchProducts: mocks.fetchProducts,
}));

const PROMOCAO: Promotion = {
  id: 'promo-1',
  name: 'Happy hour',
  discountType: 'percent',
  discountValue: 20,
  weekdays: [1, 2, 3, 4, 5],
  startTime: '18:00',
  endTime: '20:00',
  scope: 'store_wide',
  scopeId: null,
  active: true,
  version: 0,
};

let container: HTMLDivElement;
let root: Root;

// Input controlado: setar `.value` puro não dispara o rastreador de valor do
// React — precisa do setter nativo (mesmo padrão de cupons/page.test.tsx).
async function setInput(input: HTMLInputElement | null, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<PromocoesPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchPromotions.mockResolvedValue([PROMOCAO]);
  mocks.fetchCategories.mockResolvedValue([]);
  mocks.fetchProducts.mockResolvedValue([]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PromocoesPage', () => {
  it('lista as promoções existentes', async () => {
    await mount();
    expect(container.textContent).toContain('Happy hour');
    expect(container.textContent).toContain('20% off');
    expect(container.textContent).toContain('Loja toda');
  });

  it('mostra estado vazio quando não há promoção nenhuma', async () => {
    mocks.fetchPromotions.mockResolvedValue([]);
    await mount();
    expect(container.textContent).toContain('Nenhuma promoção ainda');
  });

  it('cria uma promoção pelo formulário', async () => {
    const nova: Promotion = { ...PROMOCAO, id: 'promo-2', name: 'Fim de semana' };
    mocks.fetchPromotions.mockResolvedValue([]);
    mocks.createPromotion.mockResolvedValue(nova);
    await mount();

    const abrirBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Nova promoção');
    await act(async () => {
      abrirBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await setInput(container.querySelector('input[placeholder="Happy hour"]'), 'Fim de semana');
    await setInput(container.querySelector('input[placeholder="20"]'), '15');

    const criarBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Criar promoção');
    await act(async () => {
      criarBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.createPromotion).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fim de semana', discountType: 'percent', discountValue: 15, scope: 'store_wide' }),
    );
  });

  it('pausa uma promoção ativa', async () => {
    mocks.setPromotionActive.mockResolvedValue({ ...PROMOCAO, active: false });
    await mount();

    const pausarBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Pausar');
    await act(async () => {
      pausarBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mocks.setPromotionActive).toHaveBeenCalledWith(PROMOCAO, false);
  });

  it('exige categoria selecionada quando o alcance não é loja toda', async () => {
    await mount();

    const abrirBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Nova promoção');
    await act(async () => {
      abrirBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await setInput(container.querySelector('input[placeholder="Happy hour"]'), 'X');
    await setInput(container.querySelector('input[placeholder="20"]'), '10');

    const categoriaChip = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Categoria');
    await act(async () => {
      categoriaChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const criarBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Criar promoção');
    await act(async () => {
      criarBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Selecione a categoria.');
    expect(mocks.createPromotion).not.toHaveBeenCalled();
  });
});
