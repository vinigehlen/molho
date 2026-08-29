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

  // O merge de classes já engoliu a cor do texto uma vez (ver lib/cn.test.ts):
  // o primário ficava com ink herdado, e no tema Grafite era preto sobre preto.
  it('o primário chega ao DOM com a cor da marca E a cor do texto sobre ela', () => {
    render(<MoButton variant="primary">Finalizar pedido</MoButton>);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-brand');
    expect(button).toHaveClass('text-on-brand');
  });

  // Contraste real medido em e2e/contrast.spec.ts. Aqui só travamos a escolha
  // de token, que foi contraintuitiva: o teal do PIX é claro demais para texto
  // branco (2.35:1), então o texto é ink (7.9:1). A cor do Banco Central fica.
  it.each([
    ['danger', 'bg-critical-strong', 'text-white'],
    ['pix', 'bg-pix', 'text-text'],
    ['positive', 'bg-positive', 'text-text'],
  ] as const)('a variante %s usa o par de tokens que passa AA', (variant, bg, fg) => {
    render(<MoButton variant={variant}>Ação</MoButton>);

    const button = screen.getByRole('button');
    expect(button).toHaveClass(bg);
    expect(button).toHaveClass(fg);
  });

  it('desabilitado não é opacidade: é par de tokens legível', () => {
    render(<MoButton disabled>Loja fechada</MoButton>);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('disabled:bg-disabled-surface');
    expect(button).toHaveClass('disabled:text-disabled-text');
    expect(button.className).not.toContain('opacity-40');
  });

  it('encaminha a ref para o elemento nativo', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement | null>;
    render(<MoButton ref={ref}>Salvar</MoButton>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
