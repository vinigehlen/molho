import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { MoModifierGroup, type MoModifierOption } from './mo-modifier-group';

const ADICIONAIS: MoModifierOption[] = [
  { id: 'bacon', name: 'Bacon', priceDeltaCents: 400 },
  { id: 'ovo', name: 'Ovo', priceDeltaCents: 300 },
  { id: 'queijo', name: 'Queijo extra', priceDeltaCents: 0 },
];

const PONTOS: MoModifierOption[] = [
  { id: 'mal', name: 'Mal passado', priceDeltaCents: 0 },
  { id: 'ponto', name: 'Ao ponto', priceDeltaCents: 0 },
  { id: 'bem', name: 'Bem passado', priceDeltaCents: 0 },
];

/** Wrapper controlado — igual a como o MoProductSheet usa o componente de verdade. */
function Controlado({
  min,
  max,
  options,
  initial = [],
}: {
  min: number;
  max: number;
  options: MoModifierOption[];
  initial?: string[];
}) {
  const [selecionados, setSelecionados] = React.useState<string[]>(initial);
  return (
    <MoModifierGroup
      name="Adicionais"
      min={min}
      max={max}
      options={options}
      selectedIds={selecionados}
      onChange={setSelecionados}
    />
  );
}

describe('MoModifierGroup', () => {
  it('não tem violação de acessibilidade (múltipla escolha)', async () => {
    const { container } = render(<Controlado min={0} max={2} options={ADICIONAIS} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('não tem violação de acessibilidade (escolha única obrigatória)', async () => {
    const { container } = render(<Controlado min={1} max={1} options={PONTOS} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each([
    [0, 2, 'Escolha até 2'],
    [1, 1, 'Escolha 1'],
    [1, 3, 'Escolha de 1 a 3'],
  ])('regra do grupo: min=%s max=%s → "%s"', (min, max, textoEsperado) => {
    render(<Controlado min={min} max={max} options={ADICIONAIS} />);
    expect(screen.getByText(textoEsperado)).toBeInTheDocument();
  });

  it('mostra o delta de preço à direita, e "Grátis" para delta zero', () => {
    render(<Controlado min={0} max={2} options={ADICIONAIS} />);

    expect(screen.getByText('+ R$ 4,00')).toBeInTheDocument();
    expect(screen.getByText('+ R$ 3,00')).toBeInTheDocument();
    expect(screen.getByText('Grátis')).toBeInTheDocument();
  });

  it('mostra o progresso da seleção (selecionados/max)', async () => {
    render(<Controlado min={0} max={2} options={ADICIONAIS} />);

    expect(screen.getByText('0/2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bacon/ }));
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('escolha única: marcar uma desmarca a anterior', async () => {
    render(<Controlado min={1} max={1} options={PONTOS} />);

    await userEvent.click(screen.getByRole('radio', { name: /Mal passado/ }));
    expect(screen.getByRole('radio', { name: /Mal passado/ })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: /Bem passado/ }));
    expect(screen.getByRole('radio', { name: /Bem passado/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Mal passado/ })).not.toBeChecked();
  });

  it('escolha única: clicar na opção já selecionada não muda nada (limitação do <input type="radio"> nativo, documentada no componente)', async () => {
    render(<Controlado min={0} max={1} options={PONTOS} />);

    const malPassado = screen.getByRole('radio', { name: /Mal passado/ });
    await userEvent.click(malPassado);
    expect(malPassado).toBeChecked();

    await userEvent.click(malPassado);
    expect(malPassado).toBeChecked();
  });

  it('escolha única OBRIGATÓRIA (min=1): clicar na já selecionada NÃO desmarca (grupo não pode ficar vazio)', async () => {
    render(<Controlado min={1} max={1} options={PONTOS} />);

    const malPassado = screen.getByRole('radio', { name: /Mal passado/ });
    await userEvent.click(malPassado);
    expect(malPassado).toBeChecked();

    await userEvent.click(malPassado);
    expect(malPassado).toBeChecked();
  });

  it('múltipla escolha: ao atingir o teto, as opções não selecionadas ficam desabilitadas', async () => {
    render(<Controlado min={0} max={2} options={ADICIONAIS} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /Bacon/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Ovo/ }));

    const queijo = screen.getByRole('checkbox', { name: /Queijo extra/ });
    expect(queijo).toBeDisabled();

    // Desmarcar uma libera espaço de novo.
    await userEvent.click(screen.getByRole('checkbox', { name: /Bacon/ }));
    expect(queijo).not.toBeDisabled();
  });

  it('grupo obrigatório sem seleção nenhuma: "Escolha 1", 0/1', () => {
    render(<Controlado min={1} max={1} options={PONTOS} />);
    expect(screen.getByText('Escolha 1')).toBeInTheDocument();
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });
});
