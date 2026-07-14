import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoButton } from './mo-button';
import { MoSheet } from './mo-sheet';

/** Monta o sheet com um gatilho de verdade — é assim que ele vive no produto. */
function ComGatilho({ onOpenChange }: { onOpenChange?: (open: boolean) => void } = {}) {
  const [aberto, setAberto] = React.useState(false);

  const mudar = (v: boolean) => {
    setAberto(v);
    onOpenChange?.(v);
  };

  return (
    <>
      <MoButton onClick={() => mudar(true)}>Ver o prato</MoButton>
      <MoSheet
        open={aberto}
        onOpenChange={mudar}
        title="Filé à parmegiana"
        description="Serve 2 pessoas."
        footer={<MoButton onClick={() => mudar(false)}>Adicionar</MoButton>}
      >
        <p>No capricho.</p>
      </MoSheet>
    </>
  );
}

describe('MoSheet', () => {
  it('não tem violação de acessibilidade quando aberto', async () => {
    const { container } = render(
      <MoSheet open onOpenChange={() => {}} title="Filé à parmegiana" description="Serve 2.">
        <p>No capricho.</p>
      </MoSheet>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('fechado, não renderiza nada', () => {
    render(
      <MoSheet open={false} onOpenChange={() => {}} title="Filé à parmegiana">
        <p>No capricho.</p>
      </MoSheet>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('é um diálogo modal rotulado pelo título', () => {
    render(
      <MoSheet open onOpenChange={() => {}} title="Filé à parmegiana">
        <p>No capricho.</p>
      </MoSheet>,
    );

    const dialogo = screen.getByRole('dialog', { name: 'Filé à parmegiana' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
  });

  it('Esc fecha', async () => {
    const onOpenChange = vi.fn();
    render(
      <MoSheet open onOpenChange={onOpenChange} title="Filé à parmegiana">
        <p>No capricho.</p>
      </MoSheet>,
    );

    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clique no overlay fecha', async () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <MoSheet open onOpenChange={onOpenChange} title="Filé à parmegiana">
        <p>No capricho.</p>
      </MoSheet>,
    );

    const overlay = document.querySelector('[aria-hidden="true"].absolute');
    expect(overlay).toBeInTheDocument();

    await userEvent.click(overlay as Element);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(container).toBeTruthy();
  });

  it('o botão de fechar fecha', async () => {
    const onOpenChange = vi.fn();
    render(
      <MoSheet open onOpenChange={onOpenChange} title="Filé à parmegiana">
        <p>No capricho.</p>
      </MoSheet>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ao abrir, o foco entra no sheet', async () => {
    render(<ComGatilho />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver o prato' }));

    await waitFor(() => {
      const dialogo = screen.getByRole('dialog');
      expect(dialogo.contains(document.activeElement)).toBe(true);
    });
  });

  // A regra que quase todo modal caseiro erra: o foco escapa por trás.
  it('o foco não escapa do sheet: Tab circula dentro dele', async () => {
    render(<ComGatilho />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver o prato' }));

    const dialogo = await screen.findByRole('dialog');

    // Passeia por todos os focáveis e dá mais uma volta.
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }

    // E para trás também.
    for (let i = 0; i < 6; i++) {
      await userEvent.tab({ shift: true });
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
  });

  // Sem isto, quem navega por teclado é cuspido no topo da página ao fechar.
  it('ao fechar, o foco VOLTA para quem abriu', async () => {
    render(<ComGatilho />);

    const gatilho = screen.getByRole('button', { name: 'Ver o prato' });
    await userEvent.click(gatilho);
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(gatilho).toHaveFocus());
  });

  it('trava o scroll do body enquanto está aberto, e devolve ao fechar', async () => {
    render(<ComGatilho />);

    expect(document.body.style.overflow).not.toBe('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'Ver o prato' }));
    await screen.findByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
  });
});
