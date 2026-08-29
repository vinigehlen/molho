import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SignupPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  requestSignupOtp: vi.fn(),
  verifySignup: vi.fn(),
  checkSlugAvailability: vi.fn(),
  activateStaffSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('../../lib/staff-auth', () => ({
  activateStaffSession: mocks.activateStaffSession,
}));

vi.mock('../../lib/signup-api', () => ({
  requestSignupOtp: mocks.requestSignupOtp,
  verifySignup: mocks.verifySignup,
  checkSlugAvailability: mocks.checkSlugAvailability,
}));

let container: HTMLDivElement;
let root: Root;

function input(id: string): HTMLInputElement {
  const found = container.querySelector(`#${id}`);
  if (!(found instanceof HTMLInputElement)) throw new Error(`Input não encontrado: ${id}`);
  return found;
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Botão não encontrado: ${label}`);
  return found;
}

async function type(target: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SignupPage />);
  });
}

/** Passa do passo 'email' pro 'details', onde vive o campo de nome/preview. */
async function goToDetailsStep() {
  mocks.requestSignupOtp.mockResolvedValueOnce(undefined);
  await type(input('email'), 'dono@restaurante.com');
  await act(async () => {
    button('Enviar código').click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.checkSlugAvailability.mockResolvedValue({ available: true });
});

afterEach(async () => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  await act(async () => root.unmount());
  container.remove();
});

describe('SignupPage — preview de domínio (Bloco 2)', () => {
  it('mostra "digite um nome" com o campo vazio', async () => {
    await mount();
    await goToDetailsStep();

    expect(container.textContent).toContain('digite um nome');
  });

  it('slugifica em tempo real ao digitar o nome da loja', async () => {
    await mount();
    await goToDetailsStep();

    await type(input('restaurantName'), 'Cabanhas BBQ');
    expect(container.textContent).toContain('molho.live/cabanhas-bbq');
  });

  it('depois do debounce de 400ms, consulta disponibilidade e mostra "disponível"', async () => {
    mocks.checkSlugAvailability.mockResolvedValueOnce({ available: true });
    await mount();
    await goToDetailsStep();

    await type(input('restaurantName'), 'Cabanhas BBQ');
    expect(mocks.checkSlugAvailability).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.checkSlugAvailability).toHaveBeenCalledWith('cabanhas-bbq');
    expect(container.textContent).toContain('disponível');
  });

  it('slug ocupado: mostra "indisponível" com a sugestão do backend', async () => {
    mocks.checkSlugAvailability.mockResolvedValueOnce({ available: false, suggestion: 'cabanhas-bbq-2' });
    await mount();
    await goToDetailsStep();

    await type(input('restaurantName'), 'Cabanhas BBQ');
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('indisponível');
    expect(container.textContent).toContain('cabanhas-bbq-2');
  });

  it('bloqueia o submit quando o nome normaliza pra slug vazio (só símbolos)', async () => {
    await mount();
    await goToDetailsStep();

    await type(input('code'), '123456');
    await type(input('ownerName'), 'Maria');
    await type(input('restaurantName'), '!!!');

    expect(button('Criar minha loja').disabled).toBe(true);
  });

  it('libera o submit com nome válido, mesmo sem esperar a checagem de disponibilidade responder', async () => {
    await mount();
    await goToDetailsStep();

    await type(input('code'), '123456');
    await type(input('ownerName'), 'Maria');
    await type(input('restaurantName'), 'Cabanhas BBQ');

    expect(button('Criar minha loja').disabled).toBe(false);
  });
});
