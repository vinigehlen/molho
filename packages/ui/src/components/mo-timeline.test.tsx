import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { MoTimeline, type MoTimelineStep } from './mo-timeline';

const PASSOS: MoTimelineStep[] = [
  { id: 'received', label: 'Recebido' },
  { id: 'preparing', label: 'Preparando' },
  { id: 'ready', label: 'Pronto' },
  { id: 'in_transit', label: 'Em trânsito' },
  { id: 'completed', label: 'Entregue' },
];

describe('MoTimeline', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<MoTimeline steps={PASSOS} currentIndex={1} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('marca o passo atual', () => {
    render(<MoTimeline steps={PASSOS} currentIndex={2} />);

    const atual = screen.getByRole('listitem', { current: 'step' });
    expect(atual).toHaveTextContent('Pronto');
  });

  // A regra que mais importa aqui: quem não distingue verde de cinza precisa
  // saber, lendo, o que já aconteceu e o que falta (§6.1).
  it('o estado de cada passo é TEXTO, não só cor', () => {
    render(<MoTimeline steps={PASSOS} currentIndex={1} />);

    expect(screen.getByText(/Recebido/).textContent).toContain('concluído');
    expect(screen.getByText(/Preparando/).textContent).toContain('em andamento');
    expect(screen.getByText(/Entregue/).textContent).toContain('pendente');
  });

  it('anuncia a mudança de status — o cliente não fica olhando a tela', () => {
    const { container } = render(<MoTimeline steps={PASSOS} currentIndex={0} />);
    expect(container.querySelector('ol')).toHaveAttribute('aria-live', 'polite');
  });

  it('no último passo, não desenha linha sobrando', () => {
    const { rerender } = render(<MoTimeline steps={PASSOS} currentIndex={4} />);
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Entregue');

    rerender(<MoTimeline steps={PASSOS} currentIndex={0} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});
