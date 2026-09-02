import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Review } from '../../../lib/reviews-api';
import AvaliacoesPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchReviews: vi.fn(),
  replyReview: vi.fn(),
}));

vi.mock('../../../lib/reviews-api', () => ({
  fetchReviews: mocks.fetchReviews,
  replyReview: mocks.replyReview,
}));

const REVIEW: Review = {
  id: 'review-1',
  orderId: 'order-1',
  rating: 4,
  comment: 'Muito bom!',
  reply: null,
  repliedAt: null,
  createdAt: '2026-09-02T00:00:00.000Z',
  version: 0,
};

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AvaliacoesPage />);
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
  mocks.fetchReviews.mockResolvedValue([REVIEW]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AvaliacoesPage', () => {
  it('lista as avaliações com nota e comentário', async () => {
    await mount();
    expect(container.textContent).toContain('Muito bom!');
  });

  it('estado vazio quando não há avaliação nenhuma', async () => {
    mocks.fetchReviews.mockResolvedValue([]);
    await mount();
    expect(container.textContent).toContain('Nenhuma avaliação ainda');
  });

  it('responde uma avaliação', async () => {
    mocks.replyReview.mockResolvedValue({ ...REVIEW, reply: 'Obrigado!', repliedAt: '2026-09-02T01:00:00.000Z', version: 1 });
    await mount();

    const responderBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Responder');
    await act(async () => {
      responderBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await setInput(container.querySelector('input'), 'Obrigado!');

    const enviarBotao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Enviar resposta');
    await act(async () => {
      enviarBotao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.replyReview).toHaveBeenCalledWith(REVIEW, 'Obrigado!');
    expect(container.textContent).toContain('Obrigado!');
  });
});
