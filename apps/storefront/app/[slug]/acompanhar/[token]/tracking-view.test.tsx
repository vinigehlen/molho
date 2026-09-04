import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OrderTrackingResponse } from '@molho/contracts';
import { OrderTrackingView } from './tracking-view';

const { getOrderTracking, createTrackReview } = vi.hoisted(() => ({
  getOrderTracking: vi.fn(),
  createTrackReview: vi.fn(),
}));
vi.mock('../../../../lib/order-tracking-api', () => ({
  getOrderTracking,
  createTrackReview,
  ReviewAlreadyExistsError: class extends Error {},
}));

function tracking(overrides: Partial<OrderTrackingResponse> = {}): OrderTrackingResponse {
  return {
    orderId: '0193f1a0-0000-7000-8000-000000000001',
    status: 'in_transit',
    fulfillmentType: 'delivery',
    fulfillmentDeadlineAt: null,
    totalCents: 5000,
    canceledReason: null,
    items: [{ name: 'X-Burger', quantity: 1 }],
    timeline: [{ status: 'received', at: '2026-09-01T00:00:00.000Z' }],
    ...overrides,
  };
}

describe('OrderTrackingView — Épico 16.3 (avaliação por token do acompanhamento)', () => {
  it('pedido ainda em andamento: não oferece avaliação', () => {
    render(<OrderTrackingView slug="tempero" token="token-abc" storeName="Casa Tempero" initialTracking={tracking()} />);
    expect(screen.queryByText('O que achou do pedido?')).not.toBeInTheDocument();
  });

  it('pedido completed: oferece "Avaliar pedido" e manda nota+comentário SEM Authorization', async () => {
    const user = userEvent.setup();
    createTrackReview.mockResolvedValue(undefined);
    render(
      <OrderTrackingView
        slug="tempero"
        token="token-abc"
        storeName="Casa Tempero"
        initialTracking={tracking({ status: 'completed' })}
      />,
    );

    await user.click(screen.getByText('Avaliar pedido'));
    await user.click(screen.getByRole('radio', { name: '5 estrelas' }));
    await user.type(screen.getByLabelText('Comentário (opcional)'), 'Muito bom!');
    await user.click(screen.getByText('Enviar avaliação'));

    await waitFor(() => expect(createTrackReview).toHaveBeenCalledWith('tempero', 'token-abc', { rating: 5, comment: 'Muito bom!' }));
    expect(await screen.findByText('Obrigado pela avaliação!')).toBeInTheDocument();
  });

  it('pedido já avaliado (409): trata como sucesso, mesmo agradecimento — idempotente pra quem usa', async () => {
    const user = userEvent.setup();
    const { ReviewAlreadyExistsError } = await import('../../../../lib/order-tracking-api');
    createTrackReview.mockRejectedValue(new ReviewAlreadyExistsError());
    render(
      <OrderTrackingView
        slug="tempero"
        token="token-abc"
        storeName="Casa Tempero"
        initialTracking={tracking({ status: 'completed' })}
      />,
    );

    await user.click(screen.getByText('Avaliar pedido'));
    await user.click(screen.getByRole('radio', { name: '4 estrelas' }));
    await user.click(screen.getByText('Enviar avaliação'));

    expect(await screen.findByText('Obrigado pela avaliação!')).toBeInTheDocument();
  });

  it('falha inesperada: mostra erro, não finge sucesso', async () => {
    const user = userEvent.setup();
    createTrackReview.mockRejectedValue(new Error('Não deu pra enviar sua avaliação agora.'));
    render(
      <OrderTrackingView
        slug="tempero"
        token="token-abc"
        storeName="Casa Tempero"
        initialTracking={tracking({ status: 'completed' })}
      />,
    );

    await user.click(screen.getByText('Avaliar pedido'));
    await user.click(screen.getByRole('radio', { name: '3 estrelas' }));
    await user.click(screen.getByText('Enviar avaliação'));

    expect(await screen.findByText('Não deu pra enviar sua avaliação agora.')).toBeInTheDocument();
    expect(screen.queryByText('Obrigado pela avaliação!')).not.toBeInTheDocument();
  });
});
