import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoProductSheet, type MoProductSheetProduct } from './mo-product-sheet';

const PRODUTO: MoProductSheetProduct = {
  id: 'prod-1',
  name: 'X-Burger',
  description: 'Pão brioche, blend 180g.',
  imageUrl: null,
  basePriceCents: 2890,
  modifierGroups: [
    {
      id: 'ponto',
      name: 'Ponto da carne',
      min: 1,
      max: 1,
      modifiers: [
        { id: 'mal', name: 'Mal passado', priceDeltaCents: 0 },
        { id: 'bem', name: 'Bem passado', priceDeltaCents: 0 },
      ],
    },
    {
      id: 'adicionais',
      name: 'Adicionais',
      min: 0,
      max: 2,
      modifiers: [
        { id: 'bacon', name: 'Bacon', priceDeltaCents: 400 },
        { id: 'ovo', name: 'Ovo', priceDeltaCents: 300 },
      ],
    },
  ],
};

function botaoAdicionar() {
  return screen.getByRole('button', { name: /Adicionar •/ });
}

describe('MoProductSheet', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(
      <MoProductSheet open onOpenChange={() => {}} product={PRODUTO} onAddToCart={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('produto nulo: não renderiza nada', () => {
    render(<MoProductSheet open onOpenChange={() => {}} product={null} onAddToCart={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fechado: não renderiza nada', () => {
    render(<MoProductSheet open={false} onOpenChange={() => {}} product={PRODUTO} onAddToCart={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mostra nome, descrição e os grupos de modificadores', () => {
    render(<MoProductSheet open onOpenChange={() => {}} product={PRODUTO} onAddToCart={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'X-Burger' })).toBeInTheDocument();
    expect(screen.getByText('Pão brioche, blend 180g.')).toBeInTheDocument();
    expect(screen.getByText('Ponto da carne')).toBeInTheDocument();
    expect(screen.getByText('Adicionais')).toBeInTheDocument();
  });

  it('combo: lista "Vem com" a partir de comboItems, com quantidade só quando > 1', () => {
    render(
      <MoProductSheet
        open
        onOpenChange={() => {}}
        product={{
          ...PRODUTO,
          modifierGroups: [],
          comboItems: [
            { name: 'Xis', quantity: 2 },
            { name: 'Batata', quantity: 1 },
          ],
        }}
        onAddToCart={() => {}}
      />,
    );

    expect(screen.getByText('Vem com')).toBeInTheDocument();
    expect(screen.getByText('2× Xis')).toBeInTheDocument();
    expect(screen.getByText('Batata')).toBeInTheDocument();
  });

  it('botão de adicionar começa com o preço BASE, e desabilitado (grupo obrigatório vazio)', () => {
    render(<MoProductSheet open onOpenChange={() => {}} product={PRODUTO} onAddToCart={() => {}} />);

    const botao = botaoAdicionar();
    expect(botao).toHaveTextContent('Adicionar • R$ 28,90');
    expect(botao).toBeDisabled();
  });

  it('preencher o grupo obrigatório habilita o botão', async () => {
    render(<MoProductSheet open onOpenChange={() => {}} product={PRODUTO} onAddToCart={() => {}} />);

    await userEvent.click(screen.getByRole('radio', { name: /Mal passado/ }));
    expect(botaoAdicionar()).not.toBeDisabled();
  });

  it('preço soma modificador e multiplica pela quantidade', async () => {
    render(<MoProductSheet open onOpenChange={() => {}} product={PRODUTO} onAddToCart={() => {}} />);

    await userEvent.click(screen.getByRole('radio', { name: /Mal passado/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Bacon/ })); // +400
    expect(botaoAdicionar()).toHaveTextContent('R$ 32,90'); // 2890 + 400

    await userEvent.click(screen.getByRole('button', { name: 'Colocar mais um' })); // quantidade 2
    expect(botaoAdicionar()).toHaveTextContent('R$ 65,80'); // (2890 + 400) × 2
  });

  it('onAddToCart recebe quantidade, observação e modificadores POR EXTENSO (com groupId)', async () => {
    const onAddToCart = vi.fn();
    render(<MoProductSheet open onOpenChange={() => {}} product={PRODUTO} onAddToCart={onAddToCart} />);

    await userEvent.click(screen.getByRole('radio', { name: /Mal passado/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Bacon/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Colocar mais um' }));
    await userEvent.type(screen.getByLabelText('Alguma observação?'), 'Sem cebola, por favor');
    await userEvent.click(botaoAdicionar());

    expect(onAddToCart).toHaveBeenCalledWith({
      quantity: 2,
      notes: 'Sem cebola, por favor',
      modifiers: [
        { id: 'mal', groupId: 'ponto', name: 'Mal passado', priceDeltaCents: 0 },
        { id: 'bacon', groupId: 'adicionais', name: 'Bacon', priceDeltaCents: 400 },
      ],
      totalCents: 6580,
    });
  });

  it('observação em branco vira null, não string vazia', async () => {
    const onAddToCart = vi.fn();
    render(<MoProductSheet open onOpenChange={() => {}} product={PRODUTO} onAddToCart={onAddToCart} />);

    await userEvent.click(screen.getByRole('radio', { name: /Mal passado/ }));
    await userEvent.type(screen.getByLabelText('Alguma observação?'), '   ');
    await userEvent.click(botaoAdicionar());

    expect(onAddToCart).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
  });

  it('trocar de produto com o sheet aberto reseta quantidade, observação e seleção', async () => {
    const { rerender } = render(
      <MoProductSheet open onOpenChange={() => {}} product={PRODUTO} onAddToCart={() => {}} />,
    );

    await userEvent.click(screen.getByRole('radio', { name: /Mal passado/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Colocar mais um' }));
    await userEvent.type(screen.getByLabelText('Alguma observação?'), 'sem cebola');
    expect(screen.getByRole('status')).toHaveTextContent('2');

    const outroProduto: MoProductSheetProduct = { ...PRODUTO, id: 'prod-2', name: 'Salada Caesar' };
    rerender(<MoProductSheet open onOpenChange={() => {}} product={outroProduto} onAddToCart={() => {}} />);

    // waitFor, não asserção direta: mesmo padrão de mo-sheet.test.tsx para
    // estado que muda via useEffect após o rerender (ex.: "ao abrir, o foco
    // entra no sheet") — o efeito de reset roda depois do commit.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1'));
    expect(screen.getByLabelText('Alguma observação?')).toHaveValue('');
    expect(screen.getByRole('radio', { name: /Mal passado/ })).not.toBeChecked();
  });
});
