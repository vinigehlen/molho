import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoEmptyState } from './mo-empty-state';

describe('MoEmptyState', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(
      <MoEmptyState
        title="Nenhum prato por aqui ainda"
        description="Que tal cadastrar o carro-chefe da casa?"
        action={{ label: 'Cadastrar produto', onClick: () => {} }}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('mostra título, descrição e CTA', () => {
    render(
      <MoEmptyState
        title="Seu carrinho tá vazio"
        description="Bora resolver isso?"
        action={{ label: 'Ver o cardápio', onClick: () => {} }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Seu carrinho tá vazio' })).toBeInTheDocument();
    expect(screen.getByText('Bora resolver isso?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver o cardápio' })).toBeInTheDocument();
  });

  it('aciona o CTA', async () => {
    const onClick = vi.fn();
    render(<MoEmptyState title="Vazio" action={{ label: 'Criar', onClick }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('sem ação, não inventa botão', () => {
    render(<MoEmptyState title="Nenhum pedido hoje ainda" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('a ilustração é decorativa — o título já conta a história', () => {
    const { container } = render(<MoEmptyState title="Vazio" />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
