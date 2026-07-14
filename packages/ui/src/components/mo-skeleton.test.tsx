import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { MoSkeleton, MoSkeletonText } from './mo-skeleton';

describe('MoSkeleton', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<MoSkeleton width={200} height={16} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('sem label, é forma pura: escondido do leitor de tela', () => {
    const { container } = render(<MoSkeleton />);
    const skeleton = container.firstElementChild;

    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton).not.toHaveAttribute('role');
  });

  it('com label, anuncia o carregamento', () => {
    render(<MoSkeleton label="Carregando o cardápio…" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Carregando o cardápio…')).toBeInTheDocument();
  });

  it('MoSkeletonText desenha n linhas, a última mais curta (como texto de verdade)', () => {
    const { container } = render(<MoSkeletonText lines={4} />);
    const linhas = container.querySelectorAll('.bg-border');

    expect(linhas).toHaveLength(4);
    expect(linhas[3]).toHaveClass('w-3/5');
    expect(linhas[0]).toHaveClass('w-full');
  });
});
