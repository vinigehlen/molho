import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SubscriptionApi from '../../../lib/subscription-api';
import type { SubscriptionResponse } from '../../../lib/subscription-api';
import AssinaturaPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock('../../../lib/subscription-api', async () => {
  const actual = await vi.importActual<typeof SubscriptionApi>('../../../lib/subscription-api');
  return {
    ...actual,
    fetchSubscription: mocks.fetchSubscription,
    cancelSubscription: mocks.cancelSubscription,
  };
});

const TRIAL: SubscriptionResponse = {
  status: 'trial',
  planId: 'standard',
  trialEndsAt: '2026-09-15T00:00:00.000Z',
  currentPeriodEndsAt: null,
  pastDueAt: null,
  canceledAt: null,
};

let container: HTMLDivElement;
let root: Root;
let originalConfirm: typeof window.confirm;
let confirmMock: ReturnType<typeof vi.fn<(message?: string) => boolean>>;

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AssinaturaPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchSubscription.mockResolvedValue(TRIAL);
  originalConfirm = window.confirm;
  confirmMock = vi.fn(() => true);
  window.confirm = confirmMock;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.confirm = originalConfirm;
});

describe('AssinaturaPage', () => {
  it('mostra o status trial com data de fim', async () => {
    await mount();
    expect(container.textContent).toContain('Período de teste');
    expect(container.textContent).toContain('Teste acaba em');
  });

  it('past_due mostra a data de início do atraso', async () => {
    mocks.fetchSubscription.mockResolvedValue({ ...TRIAL, status: 'past_due', pastDueAt: '2026-09-01T00:00:00.000Z' });
    await mount();
    expect(container.textContent).toContain('Pagamento atrasado');
    expect(container.textContent).toContain('Pendente desde');
  });

  it('canceled não mostra o botão de cancelar', async () => {
    mocks.fetchSubscription.mockResolvedValue({ ...TRIAL, status: 'canceled', trialEndsAt: null, canceledAt: '2026-09-01T00:00:00.000Z' });
    await mount();
    expect(findButton('Cancelar assinatura')).toBeUndefined();
  });

  it('1º clique abre confirm nativo; recusar a confirmação NÃO chama a API (só o 2º clique cancela de verdade)', async () => {
    confirmMock.mockReturnValue(false);
    await mount();

    await act(async () => {
      findButton('Cancelar assinatura')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });

  it('confirmar cancela e atualiza a tela pro novo status', async () => {
    confirmMock.mockReturnValue(true);
    mocks.cancelSubscription.mockResolvedValue({ ...TRIAL, status: 'canceled', trialEndsAt: null, canceledAt: '2026-09-08T00:00:00.000Z' });
    await mount();

    await act(async () => {
      findButton('Cancelar assinatura')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.cancelSubscription).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Cancelada');
    expect(findButton('Cancelar assinatura')).toBeUndefined();
  });
});
