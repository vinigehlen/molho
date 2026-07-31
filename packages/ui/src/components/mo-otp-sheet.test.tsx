import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoOtpSheet } from './mo-otp-sheet';

function setup(overrides: Partial<Parameters<typeof MoOtpSheet>[0]> = {}) {
  const onRequestCode = vi.fn().mockResolvedValue({ ok: true });
  const onVerifyCode = vi.fn().mockResolvedValue({ ok: true });
  const onVerified = vi.fn();
  const onOpenChange = vi.fn();
  const utils = render(
    <MoOtpSheet
      open
      onOpenChange={onOpenChange}
      onRequestCode={onRequestCode}
      onVerifyCode={onVerifyCode}
      onVerified={onVerified}
      {...overrides}
    />,
  );
  return { ...utils, onRequestCode, onVerifyCode, onVerified, onOpenChange };
}

describe('MoOtpSheet', () => {
  it('não tem violação de acessibilidade no passo do telefone', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('fechado: não renderiza nada', () => {
    render(
      <MoOtpSheet
        open={false}
        onOpenChange={() => {}}
        onRequestCode={vi.fn()}
        onVerifyCode={vi.fn()}
        onVerified={vi.fn()}
      />,
    );
    expect(screen.queryByText('Confirma seu telefone')).not.toBeInTheDocument();
  });

  it('botão "Enviar código" desabilitado até o telefone ter 10-11 dígitos', async () => {
    const user = userEvent.setup();
    setup();

    const botao = screen.getByRole('button', { name: 'Enviar código' });
    expect(botao).toBeDisabled();

    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    expect(botao).toBeEnabled();
  });

  it('telefone válido + onRequestCode ok: avança pro passo do código', async () => {
    const user = userEvent.setup();
    const { onRequestCode } = setup();

    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));

    // `undefined` no 2º argumento: canal SMS não manda e-mail nenhum.
    expect(onRequestCode).toHaveBeenCalledWith('(51) 99999-0000', undefined);
    expect(await screen.findByText('Digite o código')).toBeInTheDocument();
  });

  // Canal de e-mail (Épico 9c): o telefone continua sendo pedido porque é a
  // IDENTIDADE do cliente — o e-mail é só por onde o código chega.
  it('canal e-mail: pede telefone E e-mail, e só libera o botão com os dois', async () => {
    const user = userEvent.setup();
    const { onRequestCode } = setup({ channel: 'email' });

    const botao = screen.getByRole('button', { name: 'Enviar código' });
    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    expect(botao).toBeDisabled();

    await user.type(screen.getByLabelText('E-mail'), 'ana@loja.com');
    expect(botao).toBeEnabled();

    await user.click(botao);
    expect(onRequestCode).toHaveBeenCalledWith('(51) 99999-0000', 'ana@loja.com');
  });

  it('canal e-mail: e-mail mal formado mantém o botão desabilitado', async () => {
    const user = userEvent.setup();
    setup({ channel: 'email' });

    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.type(screen.getByLabelText('E-mail'), 'ana@loja');
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeDisabled();
  });

  it('onRequestCode falha (ex.: rate limit): mostra erro, não avança de passo', async () => {
    const user = userEvent.setup();
    setup({ onRequestCode: vi.fn().mockResolvedValue({ ok: false, message: 'Muitas tentativas — espera um pouco.' }) });

    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));

    expect(await screen.findByText('Muitas tentativas — espera um pouco.')).toBeInTheDocument();
    expect(screen.queryByText('Digite o código')).not.toBeInTheDocument();
  });

  it('código de 6 dígitos + onVerifyCode ok: chama onVerified', async () => {
    const user = userEvent.setup();
    const { onVerifyCode, onVerified } = setup();

    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByText('Digite o código');

    await user.type(screen.getByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar código' }));

    expect(onVerifyCode).toHaveBeenCalledWith('(51) 99999-0000', '123456', undefined);
    expect(onVerified).toHaveBeenCalled();
  });

  it('onVerifyCode falha (código errado): mostra erro, continua no passo do código', async () => {
    const user = userEvent.setup();
    const { onVerified } = setup({ onVerifyCode: vi.fn().mockResolvedValue({ ok: false, message: 'Código inválido ou expirado.' }) });

    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByText('Digite o código');

    await user.type(screen.getByLabelText('Código'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirmar código' }));

    expect(await screen.findByText('Código inválido ou expirado.')).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('"Trocar número" volta pro passo do telefone', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByText('Digite o código');

    await user.click(screen.getByRole('button', { name: 'Trocar número' }));
    expect(await screen.findByText('Confirma seu telefone')).toBeInTheDocument();
  });

  it('reabrir o sheet reseta pro passo do telefone', async () => {
    const user = userEvent.setup();
    const { rerender } = setup();

    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByText('Digite o código');

    rerender(
      <MoOtpSheet open={false} onOpenChange={() => {}} onRequestCode={vi.fn()} onVerifyCode={vi.fn()} onVerified={vi.fn()} />,
    );
    rerender(
      <MoOtpSheet
        open
        onOpenChange={() => {}}
        onRequestCode={vi.fn().mockResolvedValue({ ok: true })}
        onVerifyCode={vi.fn()}
        onVerified={vi.fn()}
      />,
    );

    expect(await screen.findByText('Confirma seu telefone')).toBeInTheDocument();
  });
});
