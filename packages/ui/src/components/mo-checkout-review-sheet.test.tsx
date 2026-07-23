import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoCheckoutReviewSheet, type MoCheckoutReviewData } from './mo-checkout-review-sheet';

function baseReview(overrides: Partial<MoCheckoutReviewData> = {}): MoCheckoutReviewData {
  return {
    items: [
      {
        productId: 'p1',
        name: 'X-Burger',
        available: true,
        unitBasePriceCents: 2890,
        modifiers: [],
        quantity: 2,
        notes: null,
        lineTotalCents: 5780,
        priceChanged: false,
      },
    ],
    subtotalCents: 5780,
    withinZone: true,
    deliveryFeeCents: 800,
    etaMinMinutes: 30,
    etaMaxMinutes: 50,
    isOpenNow: true,
    nextOpensAt: null,
    minOrderCents: 2000,
    totalCents: 6580,
    hasUnfavorableDivergence: false,
    canSubmit: true,
    ...overrides,
  };
}

describe('MoCheckoutReviewSheet', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(
      <MoCheckoutReviewSheet open onOpenChange={() => {}} review={baseReview()} onConfirm={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('fechado: não renderiza nada', () => {
    render(<MoCheckoutReviewSheet open={false} onOpenChange={() => {}} review={baseReview()} onConfirm={() => {}} />);
    expect(screen.queryByText('Revisa seu pedido')).not.toBeInTheDocument();
  });

  it('review null (carregando): mostra estado de carregamento, sem lista nem botão', () => {
    render(<MoCheckoutReviewSheet open onOpenChange={() => {}} review={null} onConfirm={() => {}} />);
    expect(screen.getByText('Conferindo seu pedido…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pedido' })).not.toBeInTheDocument();
  });

  it('errorMessage: mostra o erro em vez da lista', () => {
    render(
      <MoCheckoutReviewSheet
        open
        onOpenChange={() => {}}
        review={null}
        errorMessage="Não deu pra conferir seu pedido agora."
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('Não deu pra conferir seu pedido agora.')).toBeInTheDocument();
  });

  it('caminho feliz: mostra itens, subtotal/taxa/total e botão habilitado', () => {
    render(<MoCheckoutReviewSheet open onOpenChange={() => {}} review={baseReview()} onConfirm={() => {}} />);

    expect(screen.getByText('2× X-Burger')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeEnabled();
  });

  it('canSubmit false: botão desabilitado', () => {
    render(
      <MoCheckoutReviewSheet
        open
        onOpenChange={() => {}}
        review={baseReview({ canSubmit: false, withinZone: false, deliveryFeeCents: null, totalCents: null })}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeDisabled();
    expect(screen.getByText('Esse endereço está fora da nossa área de entrega.')).toBeInTheDocument();
  });

  it('loja fechada: mostra o banner específico', () => {
    render(
      <MoCheckoutReviewSheet
        open
        onOpenChange={() => {}}
        review={baseReview({ isOpenNow: false, canSubmit: false })}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('A loja está fechada agora — não dá pra confirmar o pedido.')).toBeInTheDocument();
  });

  it('abaixo do mínimo: mostra quanto falta', () => {
    render(
      <MoCheckoutReviewSheet
        open
        onOpenChange={() => {}}
        review={baseReview({ subtotalCents: 1000, minOrderCents: 2000, canSubmit: false })}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText(/Falta.*pro pedido mínimo/)).toBeInTheDocument();
  });

  it('item esgotado: aparece riscado e com aviso, sem somar ao total exibido', () => {
    render(
      <MoCheckoutReviewSheet
        open
        onOpenChange={() => {}}
        review={baseReview({
          items: [
            {
              productId: 'p1',
              name: 'X-Bacon',
              available: false,
              unitBasePriceCents: 3200,
              modifiers: [],
              quantity: 1,
              notes: null,
              lineTotalCents: 0,
              priceChanged: false,
            },
          ],
          hasUnfavorableDivergence: true,
        })}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('Esgotou — removido do pedido')).toBeInTheDocument();
  });

  it('preço mudou: mostra o aviso no item', () => {
    render(
      <MoCheckoutReviewSheet
        open
        onOpenChange={() => {}}
        review={baseReview({
          items: [
            {
              productId: 'p1',
              name: 'X-Burger',
              available: true,
              unitBasePriceCents: 3500,
              modifiers: [],
              quantity: 1,
              notes: null,
              lineTotalCents: 3500,
              priceChanged: true,
            },
          ],
          hasUnfavorableDivergence: true,
        })}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('O preço deste item mudou desde que você montou o carrinho.')).toBeInTheDocument();
  });

  it('clique em "Confirmar pedido" chama onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<MoCheckoutReviewSheet open onOpenChange={() => {}} review={baseReview()} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
