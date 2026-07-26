import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoPixPayment } from './mo-pix-payment';

const PAYLOAD = '00020101021226580014BR.GOV.BCB.PIX0136loja@exemplo.com5204000053039865802BR5913LOJA TESTE6009SAO PAULO6304ABCD';

describe('MoPixPayment', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    // jsdom expõe `navigator.clipboard` real — vi.stubGlobal troca o objeto inteiro e desfaz sozinho no unstubAllGlobals.
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<MoPixPayment payload={PAYLOAD} totalCents={3690} />);
    await waitFor(() => expect(screen.getByAltText('QR Code para pagamento PIX')).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });

  it('mostra o valor total formatado', () => {
    render(<MoPixPayment payload={PAYLOAD} totalCents={3690} />);
    expect(screen.getByText('R$ 36,90')).toBeInTheDocument();
  });

  it('renderiza o QR a partir do payload (async, client-side)', async () => {
    render(<MoPixPayment payload={PAYLOAD} totalCents={3690} />);
    const img = await screen.findByAltText('QR Code para pagamento PIX');
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('copiar código PIX chama a clipboard API com o payload inteiro e confirma visualmente', async () => {
    // user-event.setup() instala seu PRÓPRIO stub de clipboard (pra .copy()/.paste()) — precisa
    // rodar ANTES do nosso vi.stubGlobal, senão ele pisa no nosso mock.
    const user = userEvent.setup();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<MoPixPayment payload={PAYLOAD} totalCents={3690} />);

    await user.click(screen.getByRole('button', { name: 'Copiar código PIX' }));

    expect(writeText).toHaveBeenCalledWith(PAYLOAD);
    expect(await screen.findByRole('button', { name: 'Código copiado!' })).toBeInTheDocument();
  });
});
