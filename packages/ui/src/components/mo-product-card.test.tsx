import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoProductCard } from './mo-product-card';

describe('MoProductCard', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(
      <MoProductCard
        name="X-Burger"
        description="Pão brioche, blend 180g."
        priceCents={2890}
        onSelect={() => {}}
        onQuickAdd={() => {}}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('esgotado continua sem violação de acessibilidade', async () => {
    const { container } = render(
      <MoProductCard name="X-Bacon" priceCents={3200} available={false} onSelect={() => {}} onQuickAdd={() => {}} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('mostra nome, descrição e preço formatado', () => {
    render(<MoProductCard name="X-Burger" description="Blend 180g." priceCents={2890} />);

    expect(screen.getByText('X-Burger')).toBeInTheDocument();
    expect(screen.getByText('Blend 180g.')).toBeInTheDocument();
    expect(screen.getByText('R$ 28,90')).toBeInTheDocument();
  });

  it('sem foto, cai no placeholder do tema (nunca imagem quebrada)', () => {
    const { container } = render(<MoProductCard name="X-Burger" priceCents={2890} />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('clique no card dispara onSelect', async () => {
    const onSelect = vi.fn();
    render(<MoProductCard name="X-Burger" priceCents={2890} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /X-Burger/ }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('clique no "+" dispara onQuickAdd e NÃO dispara onSelect (são botões irmãos, não aninhados)', async () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();
    render(<MoProductCard name="X-Burger" priceCents={2890} onSelect={onSelect} onQuickAdd={onQuickAdd} />);

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar X-Burger ao carrinho' }));

    expect(onQuickAdd).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('esgotado: o badge é TEXTO, o card fica desativado e não dispara onSelect nem onQuickAdd', async () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();
    render(
      <MoProductCard
        name="X-Bacon"
        priceCents={3200}
        available={false}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />,
    );

    expect(screen.getByText('Esgotado')).toBeInTheDocument();

    // O card e o "+" são botões distintos, e os dois têm "X-Bacon" no nome
    // acessível ("Adicionar X-Bacon ao carrinho") — só o card carrega "Esgotado".
    const card = screen.getByRole('button', { name: /Esgotado.*X-Bacon/ });
    expect(card).toBeDisabled();

    const quickAdd = screen.getByRole('button', { name: 'Adicionar X-Bacon ao carrinho' });
    expect(quickAdd).toBeDisabled();

    await userEvent.click(card, { pointerEventsCheck: 0 });
    await userEvent.click(quickAdd, { pointerEventsCheck: 0 });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onQuickAdd).not.toHaveBeenCalled();
  });

  it('sem onQuickAdd, não existe botão "+"', () => {
    render(<MoProductCard name="X-Burger" priceCents={2890} onSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: /Adicionar/ })).not.toBeInTheDocument();
  });

  it('variante lista: a foto fica em 88px, não quadrado de largura total', () => {
    const { container } = render(<MoProductCard name="X-Burger" priceCents={2890} variant="list" />);
    expect(container.querySelector('.h-\\[88px\\].w-\\[88px\\]')).toBeInTheDocument();
  });
});
