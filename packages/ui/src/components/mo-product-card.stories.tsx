import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoProductCard } from './mo-product-card';

const meta: Meta<typeof MoProductCard> = {
  title: 'Domínio/MoProductCard',
  component: MoProductCard,
  parameters: { layout: 'padded' },
  args: {
    name: 'X-Burger',
    description: 'Pão brioche, blend 180g, queijo prato e maionese da casa.',
    priceCents: 2890,
    imageUrl: null,
    available: true,
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MoProductCard>;

export const Grade: Story = {
  args: { onSelect: () => {}, onQuickAdd: () => {} },
};

export const Lista: Story = {
  args: { variant: 'list', onSelect: () => {}, onQuickAdd: () => {} },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
};

/** Badge "Esgotado" desativa o card inteiro — não dá pra abrir nem adicionar. */
export const Esgotado: Story = {
  args: { available: false, onSelect: () => {}, onQuickAdd: () => {} },
};

/** Sem imageUrl (S3_PUBLIC_URL vazia ou produto sem foto): cai no placeholder do tema. */
export const SemFoto: Story = {
  args: { imageUrl: null, onSelect: () => {}, onQuickAdd: () => {} },
};

export const ComFoto: Story = {
  args: {
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400',
    onSelect: () => {},
    onQuickAdd: () => {},
  },
};

export const SemBotaoDeAdicaoRapida: Story = {
  args: { onSelect: () => {} },
};

/** Como aparece de verdade na Home: várias, lado a lado. */
export const Secao: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <MoProductCard
        name="X-Burger"
        description="Pão brioche, blend 180g."
        priceCents={2890}
        onSelect={() => {}}
        onQuickAdd={() => {}}
      />
      <MoProductCard
        name="X-Bacon (esgotado)"
        description="Pão brioche, blend 180g, bacon crocante."
        priceCents={3200}
        available={false}
        onSelect={() => {}}
        onQuickAdd={() => {}}
      />
      <MoProductCard
        name="Batata frita"
        priceCents={1500}
        onSelect={() => {}}
        onQuickAdd={() => {}}
      />
      <MoProductCard
        name="Coca-Cola lata"
        priceCents={700}
        onSelect={() => {}}
        onQuickAdd={() => {}}
      />
    </div>
  ),
};
