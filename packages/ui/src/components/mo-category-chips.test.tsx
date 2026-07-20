import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoCategoryChips } from './mo-category-chips';

const CATEGORIAS = [
  { id: 'burgers', name: 'Hambúrgueres' },
  { id: 'bebidas', name: 'Bebidas' },
];

describe('MoCategoryChips', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(
      <MoCategoryChips categories={CATEGORIAS} activeId="burgers" onSelect={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('sem categorias, não renderiza nada', () => {
    const { container } = render(<MoCategoryChips categories={[]} activeId={null} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marca a categoria ativa como selecionada (aria-pressed)', () => {
    render(<MoCategoryChips categories={CATEGORIAS} activeId="burgers" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'Hambúrgueres' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bebidas' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicar num chip chama onSelect com o id da categoria', async () => {
    const onSelect = vi.fn();
    render(<MoCategoryChips categories={CATEGORIAS} activeId="burgers" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bebidas' }));
    expect(onSelect).toHaveBeenCalledWith('bebidas');
  });

  it('a faixa se identifica pro leitor de tela ("Categorias do cardápio")', () => {
    render(<MoCategoryChips categories={CATEGORIAS} activeId={null} onSelect={() => {}} />);
    expect(screen.getByRole('group', { name: 'Categorias do cardápio' })).toBeInTheDocument();
  });
});
