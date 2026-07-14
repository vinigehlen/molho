import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoButton } from './mo-button';

describe('MoButton', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<MoButton>Finalizar pedido</MoButton>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('chama o onClick quando clicado', async () => {
    const onClick = vi.fn();
    render(<MoButton onClick={onClick}>Aceitar comanda</MoButton>);

    await userEvent.click(screen.getByRole('button', { name: 'Aceitar comanda' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('é operável pelo teclado', async () => {
    const onClick = vi.fn();
    render(<MoButton onClick={onClick}>Aceitar comanda</MoButton>);

    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('não dispara o onClick quando desabilitado', async () => {
    const onClick = vi.fn();
    render(
      <MoButton onClick={onClick} disabled>
        Loja fechada
      </MoButton>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('enquanto carrega: bloqueia o clique, marca aria-busy e mantém o texto ocupando espaço', async () => {
    const onClick = vi.fn();
    render(
      <MoButton onClick={onClick} loading>
        Enviando comanda
      </MoButton>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();

    // O texto continua no DOM (apenas invisível) — é o que preserva a largura
    // do botão e evita que ele "pule" debaixo do dedo.
    expect(button).toHaveTextContent('Enviando comanda');
  });

  it('nasce como type=button para não submeter formulário sem querer', () => {
    render(<MoButton>Salvar</MoButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('encaminha a ref para o elemento nativo', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement | null>;
    render(<MoButton ref={ref}>Salvar</MoButton>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
