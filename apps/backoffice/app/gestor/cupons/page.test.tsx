import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Coupon } from '../../../lib/coupons-api';
import CuponsPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchCoupons: vi.fn(),
  createCoupon: vi.fn(),
  setCouponActive: vi.fn(),
  deleteCoupon: vi.fn(),
}));

vi.mock('../../../lib/coupons-api', () => ({
  fetchCoupons: mocks.fetchCoupons,
  createCoupon: mocks.createCoupon,
  setCouponActive: mocks.setCouponActive,
  deleteCoupon: mocks.deleteCoupon,
}));

const CUPOM: Coupon = {
  id: 'cupom-1',
  code: 'PRIMEIRACOMPRA',
  discountType: 'percent',
  discountPercent: 10,
  discountValueCents: null,
  minOrderCents: 2000,
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-12-31T23:59:59.000Z',
  maxUses: 100,
  usesCount: 3,
  active: true,
  version: 0,
};

let container: HTMLDivElement;
let root: Root;

// Input controlado: setar `.value` puro não dispara o rastreador de valor do
// React — precisa do setter nativo (mesmo padrão de complementos/page.test.tsx).
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
    root.render(<CuponsPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchCoupons.mockResolvedValue([CUPOM]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CuponsPage', () => {
  it('lista os cupons existentes', async () => {
    await mount();
    expect(container.textContent).toContain('PRIMEIRACOMPRA');
    expect(container.textContent).toContain('10% off');
  });

  it('mostra estado vazio quando não há cupom nenhum', async () => {
    mocks.fetchCoupons.mockResolvedValue([]);
    await mount();
    expect(container.textContent).toContain('Nenhum cupom ainda');
  });

  it('cria um cupom pelo formulário', async () => {
    const novo: Coupon = { ...CUPOM, id: 'cupom-2', code: 'VOLTAAI' };
    mocks.fetchCoupons.mockResolvedValue([]);
    mocks.createCoupon.mockResolvedValue(novo);
    await mount();

    const abrirBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Novo cupom');
    await act(async () => {
      abrirBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await setInput(container.querySelector('input[placeholder="PRIMEIRACOMPRA"]'), 'VOLTAAI');
    await setInput(container.querySelector('input[placeholder="10"]'), '15');
    const [inicioInput, fimInput] = container.querySelectorAll('input[type="datetime-local"]');
    await setInput(inicioInput as HTMLInputElement, '2026-09-01T00:00');
    await setInput(fimInput as HTMLInputElement, '2026-12-31T23:59');

    const criarBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Criar cupom');
    await act(async () => {
      criarBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.createCoupon).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VOLTAAI', discountType: 'percent', discountPercent: 15 }),
    );
  });

  it('pausa um cupom ativo', async () => {
    mocks.setCouponActive.mockResolvedValue({ ...CUPOM, active: false });
    await mount();

    const pausarBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Pausar');
    await act(async () => {
      pausarBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mocks.setCouponActive).toHaveBeenCalledWith(CUPOM, false);
  });
});
