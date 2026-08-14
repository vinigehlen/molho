import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  fetchOtpChannel: vi.fn(),
  getStaffSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('../../lib/staff-session', () => ({ getStaffSession: mocks.getStaffSession }));
vi.mock('../../lib/staff-auth', () => ({
  fetchOtpChannel: mocks.fetchOtpChannel,
  activateStaffSession: vi.fn(),
  requestStaffOtp: vi.fn(),
  verifyStaffOtp: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage(): Promise<void> {
  await act(async () => {
    root.render(<LoginPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getStaffSession.mockReturnValue(null);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('LoginPage', () => {
  it('não sugere celular enquanto ainda carrega o canal', async () => {
    mocks.fetchOtpChannel.mockReturnValue(new Promise(() => {}));

    await renderPage();

    expect(container.textContent).toContain('Carregando login…');
    expect(container.textContent).not.toContain('Celular');
    expect(container.querySelector('#identifier')).toBeNull();
  });

  it('mostra erro claro e oferece nova tentativa sem sugerir celular', async () => {
    mocks.fetchOtpChannel.mockRejectedValue(
      new Error('Não foi possível carregar o login. Confira sua conexão.'),
    );

    await renderPage();
    await vi.waitFor(() => {
      expect(container.textContent).toContain('Não foi possível carregar o login. Confira sua conexão.');
    });
    expect(container.textContent).not.toContain('Celular');
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Tentar novamente');
    expect(retry).toBeInstanceOf(HTMLButtonElement);
  });

  it('renderiza o identificador de e-mail quando a API configura esse canal', async () => {
    mocks.fetchOtpChannel.mockResolvedValue('email');

    await renderPage();
    await vi.waitFor(() => {
      expect(container.querySelector('label[for="identifier"]')?.textContent).toBe('E-mail');
    });
    expect((container.querySelector('#identifier') as HTMLInputElement | null)?.type).toBe('email');
  });
});
