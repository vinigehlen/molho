import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoChip, MoChipGroup } from './mo-chip';

describe('MoChip', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(
      <MoChipGroup label="Categorias do cardápio">
        <MoChip selected>Massas</MoChip>
        <MoChip>Filés</MoChip>
      </MoChipGroup>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('filtro é estado, não navegação: expõe aria-pressed', () => {
    const { rerender } = render(<MoChip>Massas</MoChip>);
    expect(screen.getByRole('button', { name: 'Massas' })).toHaveAttribute('aria-pressed', 'false');

    rerender(<MoChip selected>Massas</MoChip>);
    expect(screen.getByRole('button', { name: 'Massas' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('responde a clique e a teclado', async () => {
    const onClick = vi.fn();
    render(<MoChip onClick={onClick}>Risotos</MoChip>);

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  // A pílula tem 36px de altura visual, mas o dedo precisa de 44 (§6.1): o
  // ::before estica a área clicável sem inflar o layout da faixa de categorias.
  it('estica o alvo de toque para 44px sem crescer a pílula', () => {
    render(<MoChip>Massas</MoChip>);

    const chip = screen.getByRole('button');
    expect(chip).toHaveClass('h-9'); // 36px de pílula
    expect(chip).toHaveClass('before:h-touch'); // 44px de toque
  });

  it('o grupo diz do que é a lista', () => {
    render(
      <MoChipGroup label="Categorias do cardápio">
        <MoChip>Massas</MoChip>
      </MoChipGroup>,
    );

    expect(screen.getByRole('group', { name: 'Categorias do cardápio' })).toBeInTheDocument();
  });
});
