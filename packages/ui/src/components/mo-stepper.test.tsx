import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoStepper } from './mo-stepper';

const LABEL = 'Quantidade de Filé à parmegiana';

describe('MoStepper', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<MoStepper value={2} onChange={() => {}} label={LABEL} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('soma e subtrai', async () => {
    const onChange = vi.fn();
    render(<MoStepper value={2} onChange={onChange} label={LABEL} />);

    await userEvent.click(screen.getByRole('button', { name: 'Colocar mais um' }));
    expect(onChange).toHaveBeenLastCalledWith(3);

    await userEvent.click(screen.getByRole('button', { name: 'Tirar um' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('no mínimo, não dá para pedir zero prato', async () => {
    const onChange = vi.fn();
    render(<MoStepper value={1} min={1} onChange={onChange} label={LABEL} />);

    const tirar = screen.getByRole('button', { name: 'Tirar um' });
    expect(tirar).toBeDisabled();

    await userEvent.click(tirar);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('no máximo, o + desliga', async () => {
    const onChange = vi.fn();
    render(<MoStepper value={5} max={5} onChange={onChange} label={LABEL} />);

    const mais = screen.getByRole('button', { name: 'Colocar mais um' });
    expect(mais).toBeDisabled();

    await userEvent.click(mais);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('anuncia a quantidade — quem não vê a tela precisa ouvir o número mudar', () => {
    render(<MoStepper value={3} onChange={() => {}} label={LABEL} />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('3');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('desabilitado trava os dois botões', () => {
    render(<MoStepper value={2} onChange={() => {}} label={LABEL} disabled />);

    expect(screen.getByRole('button', { name: 'Tirar um' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Colocar mais um' })).toBeDisabled();
  });
});
