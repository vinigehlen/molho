import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { MoBadge, MoOrderBadge, ORDER_STATUS_LABELS, type OrderStatus } from './mo-badge';

const STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

describe('MoBadge', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<MoBadge variant="received">Recebido</MoBadge>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each(STATUSES)('o status %s é sempre TEXTO, não só cor', (status) => {
    render(<MoOrderBadge status={status} />);
    expect(screen.getByText(ORDER_STATUS_LABELS[status])).toBeInTheDocument();
  });

  it.each(STATUSES)('o status %s carrega o par fundo+texto medido', (status) => {
    const { container } = render(<MoOrderBadge status={status} />);
    const badge = container.firstElementChild;

    const chave = status.replace('_', '-');
    expect(badge).toHaveClass(`bg-status-${chave}`);
    expect(badge).toHaveClass(`text-status-${chave}-on`);
  });

  it('o dot de "ao vivo" é decorativo — o texto já diz o que está acontecendo', () => {
    const { container } = render(
      <MoBadge variant="preparing" live>
        Preparando
      </MoBadge>,
    );

    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
    expect(screen.getByText('Preparando')).toBeInTheDocument();
  });

  it('usa o vermelho forte no crítico (o red-500 reprova com texto branco)', () => {
    const { container } = render(<MoBadge variant="critical">Estornado</MoBadge>);
    expect(container.firstElementChild).toHaveClass('bg-critical-strong');
  });
});
