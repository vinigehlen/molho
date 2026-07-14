import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoTimeline, type MoTimelineStep } from './mo-timeline';

/** A máquina de estados do pedido (docs/02-definicoes-v1.md §5.1). */
const PASSOS: MoTimelineStep[] = [
  { id: 'received', label: 'Recebido', description: 'A casa já viu sua comanda', at: '19:42' },
  { id: 'preparing', label: 'Preparando', description: 'Tá no fogo', at: '19:45' },
  { id: 'ready', label: 'Pronto', description: 'Saindo da cozinha' },
  { id: 'in_transit', label: 'Em trânsito', description: 'O entregador tá a caminho' },
  { id: 'completed', label: 'Entregue', description: 'Bom apetite!' },
];

// Anotado em vez de `satisfies`: com `decorators`, o tipo inferido do meta não é
// nomeável sob o layout do pnpm (TS2742).
const meta: Meta<typeof MoTimeline> = {
  title: 'Fundamentos/MoTimeline',
  component: MoTimeline,
  parameters: { layout: 'padded' },
  args: { steps: PASSOS, currentIndex: 1 },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MoTimeline>;

export const Preparando: Story = {};

export const AcabouDeCair: Story = {
  args: { currentIndex: 0 },
};

export const ACaminho: Story = {
  args: { currentIndex: 3 },
};

export const Entregue: Story = {
  args: { currentIndex: 4 },
};
