import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoInput } from './mo-input';

describe('MoInput', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<MoInput label="Nome do prato" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('associa a label ao campo (sem placeholder-como-label)', () => {
    render(<MoInput label="WhatsApp da loja" />);
    expect(screen.getByLabelText('WhatsApp da loja')).toBeInstanceOf(HTMLInputElement);
  });

  it('gera ids únicos para dois campos com a mesma label', () => {
    render(
      <>
        <MoInput label="Telefone" />
        <MoInput label="Telefone" />
      </>,
    );

    const [primeiro, segundo] = screen.getAllByLabelText('Telefone');
    expect(primeiro?.id).toBeTruthy();
    expect(primeiro?.id).not.toBe(segundo?.id);
  });

  it('anuncia o erro e marca o campo como inválido', async () => {
    render(<MoInput label="Slug da loja" error="Só letras, números e hífen." />);

    const input = screen.getByLabelText('Slug da loja');
    const erro = screen.getByRole('alert');

    expect(erro).toHaveTextContent('Só letras, números e hífen.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', erro.id);

    expect(await axe(render(<MoInput label="X" error="ruim" />).container)).toHaveNoViolations();
  });

  it('com erro, o hint sai da tela e do aria-describedby', () => {
    render(<MoInput label="Pedido mínimo" hint="Uma dica" error="Um erro" />);

    const input = screen.getByLabelText('Pedido mínimo');
    expect(screen.queryByText('Uma dica')).not.toBeInTheDocument();
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it('aplica a máscara de telefone enquanto o lojista digita', async () => {
    render(<MoInput label="WhatsApp" mask="phone" />);

    const input = screen.getByLabelText<HTMLInputElement>('WhatsApp');
    await userEvent.type(input, '11987654321');

    expect(input.value).toBe('(11) 98765-4321');
  });

  it('aplica a máscara de dinheiro da direita para a esquerda', async () => {
    render(<MoInput label="Pedido mínimo" mask="currency" />);

    const input = screen.getByLabelText<HTMLInputElement>('Pedido mínimo');
    await userEvent.type(input, '1990');

    expect(input.value).toBe('R$ 19,90');
  });

  it('entrega o valor já mascarado no onChange', async () => {
    const onChange = vi.fn();
    render(<MoInput label="CEP" mask="cep" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('CEP'), '01310100');

    const ultimoEvento = onChange.mock.lastCall?.[0] as React.ChangeEvent<HTMLInputElement>;
    expect(ultimoEvento.target.value).toBe('01310-100');
  });

  it('sem máscara, não mexe no que foi digitado', async () => {
    render(<MoInput label="Nome do prato" />);

    const input = screen.getByLabelText<HTMLInputElement>('Nome do prato');
    await userEvent.type(input, 'Filé à parmegiana');

    expect(input.value).toBe('Filé à parmegiana');
  });
});
