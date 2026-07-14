import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoCard } from './mo-card';
import { MoSkeleton, MoSkeletonText } from './mo-skeleton';

const meta = {
  title: 'Fundamentos/MoSkeleton',
  component: MoSkeleton,
  parameters: { layout: 'padded' },
  args: { width: 240, height: 16 },
} satisfies Meta<typeof MoSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

export const Texto: Story = {
  render: () => (
    <div className="w-80">
      <MoSkeletonText lines={3} />
    </div>
  ),
};

/** É assim que o cardápio carrega: a forma do prato antes do prato. */
export const CardDeProduto: Story = {
  render: () => (
    <MoCard className="w-80">
      <div className="flex gap-4">
        <MoSkeleton width={88} height={88} rounded="md" />
        <div className="flex-1">
          <MoSkeletonText lines={2} label="Carregando o cardápio…" />
        </div>
      </div>
    </MoCard>
  ),
};
