import type { Meta, StoryObj } from '@storybook/react-vite';
import { formatCents } from '../lib/format';
import { MoButton } from './mo-button';
import {
  MoCard,
  MoCardContent,
  MoCardDescription,
  MoCardFooter,
  MoCardHeader,
  MoCardTitle,
} from './mo-card';

const meta = {
  title: 'Fundamentos/MoCard',
  component: MoCard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MoCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  render: (args) => (
    <MoCard {...args} className="max-w-sm">
      <MoCardHeader>
        <MoCardTitle>Filé à parmegiana</MoCardTitle>
        <MoCardDescription>Serve 2 pessoas. Acompanha arroz e fritas.</MoCardDescription>
      </MoCardHeader>
      <MoCardContent className="pt-4 text-body-strong tnum">{formatCents(8990)}</MoCardContent>
    </MoCard>
  ),
};

/** Com onClick, o card vira <button> — foco, Enter e Espaço funcionam de graça. */
export const Interativo: Story = {
  render: (args) => (
    <MoCard {...args} onClick={() => alert('Abriu o produto')} className="max-w-sm">
      <MoCardHeader>
        <MoCardTitle>Risoto de funghi</MoCardTitle>
        <MoCardDescription>No capricho, com parmesão de verdade.</MoCardDescription>
      </MoCardHeader>
      <MoCardContent className="pt-4 text-body-strong tnum">{formatCents(6500)}</MoCardContent>
    </MoCard>
  ),
};

export const ComRodape: Story = {
  render: (args) => (
    <MoCard {...args} padding="lg" className="max-w-sm">
      <MoCardHeader>
        <MoCardTitle>Comanda #1042</MoCardTitle>
        <MoCardDescription>Chegou há 2 min • PIX a confirmar</MoCardDescription>
      </MoCardHeader>
      <MoCardContent className="py-4">2× Parmegiana · 1× Guaraná 2L</MoCardContent>
      <MoCardFooter>
        <MoButton size="sm">Aceitar</MoButton>
        <MoButton size="sm" variant="ghost">
          Recusar
        </MoButton>
      </MoCardFooter>
    </MoCard>
  ),
};
