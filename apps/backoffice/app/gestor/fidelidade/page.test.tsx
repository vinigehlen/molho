import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FidelidadePage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchLoyaltyConfig: vi.fn(),
  updateLoyaltyConfig: vi.fn(),
}));

vi.mock('../../../lib/loyalty-config-api', () => ({
  fetchLoyaltyConfig: mocks.fetchLoyaltyConfig,
  updateLoyaltyConfig: mocks.updateLoyaltyConfig,
}));

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<FidelidadePage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setInput(input: HTMLInputElement | null, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchLoyaltyConfig.mockResolvedValue({ cashbackPercent: 5, version: 0 });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('FidelidadePage', () => {
  it('carrega o percentual atual', async () => {
    await mount();
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('5');
  });

  it('salva um novo percentual', async () => {
    mocks.updateLoyaltyConfig.mockResolvedValue({ cashbackPercent: 8, version: 1 });
    await mount();

    await setInput(container.querySelector('input'), '8');
    const botao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Salvar');
    await act(async () => {
      botao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.updateLoyaltyConfig).toHaveBeenCalledWith({ cashbackPercent: 5, version: 0 }, 8);
    expect(container.textContent).toContain('Salvo!');
  });

  it('rejeita percentual fora de 1-100 sem chamar a API', async () => {
    await mount();

    await setInput(container.querySelector('input'), '150');
    const botao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Salvar');
    await act(async () => {
      botao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mocks.updateLoyaltyConfig).not.toHaveBeenCalled();
    expect(container.textContent).toContain('entre 1 e 100');
  });
});
