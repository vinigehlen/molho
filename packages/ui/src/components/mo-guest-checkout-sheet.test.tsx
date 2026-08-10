import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoGuestCheckoutSheet } from './mo-guest-checkout-sheet';

function setup(overrides: Partial<Parameters<typeof MoGuestCheckoutSheet>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({ ok: true });
  const onOpenChange = vi.fn();
  const utils = render(<MoGuestCheckoutSheet open onOpenChange={onOpenChange} onSubmit={onSubmit} {...overrides} />);
  return { ...utils, onSubmit, onOpenChange };
}

describe('MoGuestCheckoutSheet', () => {
  it('não pede código nenhum — o ponto do guest é não ter passo 2', () => {
    setup();

    expect(screen.getByLabelText(/Nome/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Telefone/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Código/)).not.toBeInTheDocument();
  });

  it('botão travado até ter nome E telefone completo', async () => {
    const user = userEvent.setup();
    setup();
    const botao = screen.getByRole('button', { name: 'Fazer pedido' });

    expect(botao).toBeDisabled();

    await user.type(screen.getByLabelText(/Nome/), 'Ana Souza');
    expect(botao).toBeDisabled();

    await user.type(screen.getByLabelText(/Telefone/), '51999990000');
    expect(botao).toBeEnabled();
  });

  it('telefone fixo (10 dígitos) não passa — o lojista liga pra confirmar a entrega', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/Nome/), 'Ana Souza');
    await user.type(screen.getByLabelText(/Telefone/), '5133334444');

    expect(screen.getByRole('button', { name: 'Fazer pedido' })).toBeDisabled();
  });

  it('envia nome sem espaço em volta e o telefone como digitado', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();

    await user.type(screen.getByLabelText(/Nome/), '  Ana Souza  ');
    await user.type(screen.getByLabelText(/Telefone/), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Fazer pedido' }));

    expect(onSubmit).toHaveBeenCalledWith('Ana Souza', '(51) 99999-0000');
  });

  it('erro do servidor aparece no campo de telefone, sem perder o que foi digitado', async () => {
    const user = userEvent.setup();
    setup({ onSubmit: vi.fn().mockResolvedValue({ ok: false, message: 'Telefone inválido.' }) });

    await user.type(screen.getByLabelText(/Nome/), 'Ana Souza');
    await user.type(screen.getByLabelText(/Telefone/), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Fazer pedido' }));

    expect(await screen.findByText('Telefone inválido.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome/)).toHaveValue('Ana Souza');
  });

  it('sem violação de acessibilidade', async () => {
    const { container } = setup();

    expect(await axe(container)).toHaveNoViolations();
  });
});
