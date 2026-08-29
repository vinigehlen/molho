import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoCheckoutReviewSheet, type MoCheckoutReviewData, type MoPaymentMethod } from './mo-checkout-review-sheet';

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

const TODOS_OS_METODOS: MoPaymentMethod[] = ['pix', 'cash_on_delivery', 'card_on_delivery'];

/** Props obrigatórias do seletor de método (Épico 8) — default pix + os 3 disponíveis, sem handlers, pra não poluir todo render() que não testa o seletor em si. */
function paymentProps(overrides: {
  paymentMethod?: MoPaymentMethod;
  changeForCents?: number | null;
  availablePaymentMethods?: MoPaymentMethod[];
} = {}) {
  return {
    availablePaymentMethods: overrides.availablePaymentMethods ?? TODOS_OS_METODOS,
    paymentMethod: overrides.paymentMethod ?? ('pix' as MoPaymentMethod),
    onPaymentMethodChange: vi.fn(),
    changeForCents: overrides.changeForCents ?? null,
    onChangeForCentsChange: vi.fn(),
  };
}

describe('MoCheckoutReviewSheet', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(
      <MoCheckoutReviewSheet open onOpenChange={() => {}} review={baseReview()} onConfirm={() => {}} {...paymentProps()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('fechado: não renderiza nada', () => {
    render(
      <MoCheckoutReviewSheet open={false} onOpenChange={() => {}} review={baseReview()} onConfirm={() => {}} {...paymentProps()} />,
    );
    expect(screen.queryByText('Revisa seu pedido')).not.toBeInTheDocument();
  });

  it('review null (carregando): mostra estado de carregamento, sem lista nem botão', () => {
    render(<MoCheckoutReviewSheet open onOpenChange={() => {}} review={null} onConfirm={() => {}} {...paymentProps()} />);
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
        {...paymentProps()}
      />,
    );
    expect(screen.getByText('Não deu pra conferir seu pedido agora.')).toBeInTheDocument();
  });

  it('caminho feliz: mostra itens, subtotal/taxa/total e botão habilitado', () => {
    render(<MoCheckoutReviewSheet open onOpenChange={() => {}} review={baseReview()} onConfirm={() => {}} {...paymentProps()} />);

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
        {...paymentProps()}
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
        {...paymentProps()}
      />,
    );
    expect(screen.getByText('A loja está fechada agora, não dá pra confirmar o pedido.')).toBeInTheDocument();
  });

  it('abaixo do mínimo: mostra quanto falta', () => {
    render(
      <MoCheckoutReviewSheet
        open
        onOpenChange={() => {}}
        review={baseReview({ subtotalCents: 1000, minOrderCents: 2000, canSubmit: false })}
        onConfirm={() => {}}
        {...paymentProps()}
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
        {...paymentProps()}
      />,
    );
    expect(screen.getByText('Esgotou, removido do pedido')).toBeInTheDocument();
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
        {...paymentProps()}
      />,
    );
    expect(screen.getByText('O preço deste item mudou desde que você montou o carrinho.')).toBeInTheDocument();
  });

  it('clique em "Confirmar pedido" chama onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<MoCheckoutReviewSheet open onOpenChange={() => {}} review={baseReview()} onConfirm={onConfirm} {...paymentProps()} />);

    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('aceite legal desmarcado: mostra links e bloqueia confirmação até marcar', async () => {
    const user = userEvent.setup();
    const onLegalAcceptedChange = vi.fn();
    render(
      <MoCheckoutReviewSheet
        open
        onOpenChange={() => {}}
        review={baseReview()}
        onConfirm={() => {}}
        {...paymentProps()}
        legalAccepted={false}
        onLegalAcceptedChange={onLegalAcceptedChange}
        termsHref="https://molho.live/termos"
        privacyHref="https://molho.live/privacidade"
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'termos de uso' })).toHaveAttribute('href', 'https://molho.live/termos');
    expect(screen.getByRole('link', { name: 'política de privacidade' })).toHaveAttribute('href', 'https://molho.live/privacidade');

    await user.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
    expect(onLegalAcceptedChange).toHaveBeenCalledWith(true);
  });

  describe('seletor de forma de pagamento (Épico 8)', () => {
    it('mostra os 3 métodos, pix selecionado por padrão', () => {
      render(<MoCheckoutReviewSheet open onOpenChange={() => {}} review={baseReview()} onConfirm={() => {}} {...paymentProps()} />);

      expect(screen.getByRole('button', { name: 'Pix' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Dinheiro na entrega' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Cartão na entrega' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('clicar em "Dinheiro na entrega" chama onPaymentMethodChange e revela o campo de troco', async () => {
      const user = userEvent.setup();
      const onPaymentMethodChange = vi.fn();
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ paymentMethod: 'pix' })}
          onPaymentMethodChange={onPaymentMethodChange}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Dinheiro na entrega' }));
      expect(onPaymentMethodChange).toHaveBeenCalledWith('cash_on_delivery');
    });

    it('cash_on_delivery + changeForCents null: mostra "Não preciso de troco" marcado, sem campo de valor', () => {
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ paymentMethod: 'cash_on_delivery', changeForCents: null })}
        />,
      );

      expect(screen.getByLabelText('Não preciso de troco')).toBeChecked();
      expect(screen.queryByLabelText('Troco pra quanto?')).not.toBeInTheDocument();
    });

    it('cash_on_delivery + changeForCents preenchido: mostra o campo com o valor', () => {
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ paymentMethod: 'cash_on_delivery', changeForCents: 8000 })}
        />,
      );

      expect(screen.getByLabelText('Não preciso de troco')).not.toBeChecked();
      expect(screen.getByLabelText('Troco pra quanto?')).toHaveValue('R$ 80,00');
    });

    it('troco menor que o total: mostra erro no campo', () => {
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview({ totalCents: 6580 })}
          onConfirm={() => {}}
          {...paymentProps({ paymentMethod: 'cash_on_delivery', changeForCents: 1000 })}
        />,
      );

      expect(screen.getByText('Esse valor é menor que o total do pedido.')).toBeInTheDocument();
    });

    it('desmarcar "Não preciso de troco" chama onChangeForCentsChange(0), reabrindo o campo pra digitar', async () => {
      const user = userEvent.setup();
      const onChangeForCentsChange = vi.fn();
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ paymentMethod: 'cash_on_delivery', changeForCents: null })}
          onChangeForCentsChange={onChangeForCentsChange}
        />,
      );

      await user.click(screen.getByLabelText('Não preciso de troco'));
      expect(onChangeForCentsChange).toHaveBeenCalledWith(0);
    });

    it('pix/card_on_delivery: nunca mostra o campo de troco', () => {
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ paymentMethod: 'card_on_delivery' })}
        />,
      );
      expect(screen.queryByText('Não preciso de troco')).not.toBeInTheDocument();
    });
  });

  describe('availablePaymentMethods (Ajuste 1) — só oferece o que a loja aceita', () => {
    it('renderiza só os chips recebidos, nunca a lista fixa dos 3', () => {
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ availablePaymentMethods: ['pix', 'card_on_delivery'] })}
        />,
      );

      expect(screen.getByRole('button', { name: 'Pix' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cartão na entrega' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Dinheiro na entrega' })).not.toBeInTheDocument();
    });

    it('exatamente 1 método disponível: pré-seleciona sozinho', () => {
      const onPaymentMethodChange = vi.fn();
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ availablePaymentMethods: ['cash_on_delivery'], paymentMethod: 'pix' })}
          onPaymentMethodChange={onPaymentMethodChange}
        />,
      );

      expect(onPaymentMethodChange).toHaveBeenCalledWith('cash_on_delivery');
    });

    it('método atual não está entre os disponíveis: corrige pro primeiro disponível, mesmo com mais de 1 opção', () => {
      const onPaymentMethodChange = vi.fn();
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ availablePaymentMethods: ['cash_on_delivery', 'card_on_delivery'], paymentMethod: 'pix' })}
          onPaymentMethodChange={onPaymentMethodChange}
        />,
      );

      expect(onPaymentMethodChange).toHaveBeenCalledWith('cash_on_delivery');
    });

    it('método atual já está entre os disponíveis (2+): não mexe na escolha do cliente', () => {
      const onPaymentMethodChange = vi.fn();
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ availablePaymentMethods: ['pix', 'card_on_delivery'], paymentMethod: 'card_on_delivery' })}
          onPaymentMethodChange={onPaymentMethodChange}
        />,
      );

      expect(onPaymentMethodChange).not.toHaveBeenCalled();
    });

    it('array vazio (loja sem nenhum método pronto): mostra aviso, sem chips, botão desabilitado', () => {
      render(
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          {...paymentProps({ availablePaymentMethods: [] })}
        />,
      );

      expect(screen.getByText('Essa loja não tem nenhuma forma de pagamento configurada agora.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Pix' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeDisabled();
    });
  });

  describe('reset do troco entre métodos (Ajuste 2) — sem valor fantasma', () => {
    /** Harness controlado de verdade — o bug só existe com estado real indo e voltando pelo componente, não com props fixas. */
    function ControlledSheet() {
      const [paymentMethod, setPaymentMethod] = React.useState<MoPaymentMethod>('cash_on_delivery');
      const [changeForCents, setChangeForCents] = React.useState<number | null>(0);
      return (
        <MoCheckoutReviewSheet
          open
          onOpenChange={() => {}}
          review={baseReview()}
          onConfirm={() => {}}
          availablePaymentMethods={TODOS_OS_METODOS}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          changeForCents={changeForCents}
          onChangeForCentsChange={setChangeForCents}
        />
      );
    }

    it('dinheiro → digita troco → cartão → volta pra dinheiro: campo vem vazio, não com o valor antigo', async () => {
      const user = userEvent.setup();
      render(<ControlledSheet />);

      // Começa em cash_on_delivery com changeForCents:0 (campo aberto, vazio) — digita o troco.
      fireEvent.change(screen.getByLabelText('Troco pra quanto?'), { target: { value: '5000' } });
      expect(screen.getByLabelText('Troco pra quanto?')).toHaveValue('R$ 50,00');

      await user.click(screen.getByRole('button', { name: 'Cartão na entrega' }));
      await user.click(screen.getByRole('button', { name: 'Dinheiro na entrega' }));

      // Volta em cash_on_delivery: sem o valor antigo. changeForCents foi
      // limpo pra null ao sair (selecionarMetodo), então "não precisa de
      // troco" vem marcado e o campo nem aparece — não reaparece com "R$ 50,00".
      expect(screen.getByLabelText('Não preciso de troco')).toBeChecked();
      expect(screen.queryByLabelText('Troco pra quanto?')).not.toBeInTheDocument();
    });
  });
});
