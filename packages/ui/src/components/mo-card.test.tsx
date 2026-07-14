import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoCard, MoCardContent, MoCardHeader, MoCardTitle } from './mo-card';

describe('MoCard', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(
      <MoCard>
        <MoCardHeader>
          <MoCardTitle>Filé à parmegiana</MoCardTitle>
        </MoCardHeader>
        <MoCardContent>Serve 2 pessoas.</MoCardContent>
      </MoCard>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('sem onClick, é só uma superfície — não vira botão', () => {
    render(<MoCard>Conteúdo</MoCard>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('com onClick, vira um botão de verdade (focável e operável por teclado)', async () => {
    const onClick = vi.fn();
    render(<MoCard onClick={onClick}>Risoto de funghi</MoCard>);

    const card = screen.getByRole('button', { name: 'Risoto de funghi' });

    await userEvent.tab();
    expect(card).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();

    await userEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('card interativo continua sem violação de acessibilidade', async () => {
    const { container } = render(<MoCard onClick={() => {}}>Abrir produto</MoCard>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('aceita padding maior', () => {
    render(<MoCard padding="lg">Conteúdo</MoCard>);
    expect(screen.getByText('Conteúdo')).toHaveClass('p-6');
  });
});
