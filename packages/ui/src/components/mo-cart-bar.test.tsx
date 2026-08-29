import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoCartBar } from './mo-cart-bar';

/** jsdom não rola de verdade — simula o browser mexendo em `window.scrollY` e disparando o evento. */
function rolarPara(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

describe('MoCartBar', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<MoCartBar itemCount={3} totalCents={4500} onClick={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('carrinho vazio: não renderiza nada', () => {
    const { container } = render(<MoCartBar itemCount={0} totalCents={0} onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('o botão carrega um aria-label completo (contador e total não são anunciados soltos)', () => {
    render(<MoCartBar itemCount={3} totalCents={4500} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Ver carrinho: 3 itens, total R$ 45,00' })).toBeInTheDocument();
  });

  it('singular: "1 item", não "1 itens"', () => {
    render(<MoCartBar itemCount={1} totalCents={1990} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Ver carrinho: 1 item, total R$ 19,90' })).toBeInTheDocument();
  });

  it('clique dispara onClick', async () => {
    const onClick = vi.fn();
    render(<MoCartBar itemCount={2} totalCents={3000} onClick={onClick} />);

    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('some ao rolar pra baixo, depois de passar o topo', () => {
    render(<MoCartBar itemCount={2} totalCents={3000} onClick={() => {}} />);
    const wrapper = screen.getByRole('button').parentElement as HTMLElement;

    expect(wrapper.className).toContain('opacity-100');

    rolarPara(200);
    expect(wrapper.className).toContain('opacity-0');
  });

  it('volta ao rolar pra cima', () => {
    render(<MoCartBar itemCount={2} totalCents={3000} onClick={() => {}} />);
    const wrapper = screen.getByRole('button').parentElement as HTMLElement;

    rolarPara(400);
    expect(wrapper.className).toContain('opacity-0');

    rolarPara(200);
    expect(wrapper.className).toContain('opacity-100');
  });

  it('perto do topo (≤80px), nunca esconde mesmo rolando pra baixo', () => {
    render(<MoCartBar itemCount={2} totalCents={3000} onClick={() => {}} />);
    const wrapper = screen.getByRole('button').parentElement as HTMLElement;

    rolarPara(50);
    expect(wrapper.className).toContain('opacity-100');
  });

  it('ignora tremor pequeno de rolagem (rubber-band)', () => {
    render(<MoCartBar itemCount={2} totalCents={3000} onClick={() => {}} />);
    const wrapper = screen.getByRole('button').parentElement as HTMLElement;

    rolarPara(200);
    expect(wrapper.className).toContain('opacity-0');

    // Tremor de 3px não deveria fazer a barra voltar.
    rolarPara(197);
    expect(wrapper.className).toContain('opacity-0');
  });
});
