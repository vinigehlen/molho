import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoCartBar } from './mo-cart-bar';

const meta: Meta<typeof MoCartBar> = {
  title: 'Domínio/MoCartBar',
  component: MoCartBar,
  parameters: { layout: 'fullscreen' },
  args: { itemCount: 3, totalCents: 4500, onClick: () => {} },
  decorators: [
    (Story) => (
      <div className="relative h-64 bg-bg">
        <p className="p-4 text-body text-text-muted">
          Pill fixa no rodapé — some ao rolar pra baixo, volta ao rolar pra cima.
        </p>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MoCartBar>;

export const Padrao: Story = {};

export const UmItem: Story = {
  args: { itemCount: 1, totalCents: 1990 },
};

/** itemCount ≤ 0: não renderiza nada — o chamador não precisa checar antes de montar. */
export const CarrinhoVazio: Story = {
  args: { itemCount: 0, totalCents: 0 },
};
