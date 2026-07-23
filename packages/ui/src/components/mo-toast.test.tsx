import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoToast } from './mo-toast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('MoToast', () => {
  it('não tem violação de acessibilidade', async () => {
    vi.useRealTimers();
    const { container } = render(<MoToast open message="Preço caiu" onOpenChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('aberto: mostra a mensagem', () => {
    render(<MoToast open message="Taxa de entrega caiu pra R$ 5,00" onOpenChange={() => {}} />);
    expect(screen.getByText('Taxa de entrega caiu pra R$ 5,00')).toBeInTheDocument();
  });

  it('fechado: não deixa a mensagem anterior no DOM (evita anúncio obsoleto pro leitor de tela)', () => {
    render(<MoToast open={false} message="Preço caiu" onOpenChange={() => {}} />);
    expect(screen.queryByText('Preço caiu')).not.toBeInTheDocument();
  });

  it('some sozinho depois de durationMs, chamando onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(<MoToast open message="Preço caiu" onOpenChange={onOpenChange} durationMs={2000} />);

    expect(onOpenChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('não dispara o timer enquanto fechado', () => {
    const onOpenChange = vi.fn();
    render(<MoToast open={false} message="x" onOpenChange={onOpenChange} durationMs={1000} />);

    vi.advanceTimersByTime(5000);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
