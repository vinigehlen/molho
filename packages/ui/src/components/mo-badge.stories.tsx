import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoBadge, MoOrderBadge, ORDER_STATUS_LABELS, type OrderStatus } from './mo-badge';

const meta = {
  title: 'Fundamentos/MoBadge',
  component: MoBadge,
  args: { children: 'Recebido', variant: 'received' },
} satisfies Meta<typeof MoBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

/** No gestor de pedidos, o dot pulsa enquanto a comanda está viva. */
export const AoVivo: Story = {
  args: { variant: 'preparing', children: 'Preparando', live: true },
};

/** Todo status do pedido, cada um com o texto que passa AA sobre a cor dele. */
export const StatusDoPedido: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
        <MoOrderBadge key={status} status={status} />
      ))}
    </div>
  ),
};

export const Semanticos: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <MoBadge variant="neutral">Rascunho</MoBadge>
      <MoBadge variant="positive">Pago</MoBadge>
      <MoBadge variant="caution">A confirmar</MoBadge>
      <MoBadge variant="critical">Estornado</MoBadge>
    </div>
  ),
};
