import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoEmptyState } from './mo-empty-state';

const meta = {
  title: 'Fundamentos/MoEmptyState',
  component: MoEmptyState,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MoEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Backoffice, cardápio zerado. A copy convida — não informa um vazio. */
export const CardapioVazio: Story = {
  args: {
    title: 'Nenhum prato por aqui ainda',
    description: 'Que tal cadastrar o carro-chefe da casa?',
    action: { label: 'Cadastrar produto', onClick: () => {} },
  },
};

/** Storefront, carrinho vazio. */
export const CarrinhoVazio: Story = {
  args: {
    title: 'Seu carrinho tá vazio',
    description: 'Bora resolver isso?',
    action: { label: 'Ver o cardápio', onClick: () => {} },
  },
};

export const SemAcao: Story = {
  args: {
    title: 'Nenhum pedido hoje ainda',
    description: 'Assim que cair o primeiro, ele aparece aqui e o som toca.',
  },
};
