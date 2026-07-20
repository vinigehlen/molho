import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import { MoCategoryChips } from './mo-category-chips';

const CATEGORIAS = [
  { id: 'mais-pedidos', name: 'Os mais pedidos' },
  { id: 'burgers', name: 'Hambúrgueres' },
  { id: 'acompanhamentos', name: 'Acompanhamentos' },
  { id: 'bebidas', name: 'Bebidas' },
  { id: 'sobremesas', name: 'Sobremesas' },
];

const meta: Meta<typeof MoCategoryChips> = {
  title: 'Domínio/MoCategoryChips',
  component: MoCategoryChips,
  parameters: { layout: 'padded' },
  args: { categories: CATEGORIAS },
  render: function Controlado(args) {
    const [ativa, setAtiva] = React.useState(args.activeId ?? CATEGORIAS[0]!.id);
    return <MoCategoryChips {...args} activeId={ativa} onSelect={setAtiva} />;
  },
};

export default meta;
type Story = StoryObj<typeof MoCategoryChips>;

export const Padrao: Story = {};

/** Como aparece na Home: sticky logo abaixo do cabeçalho, conteúdo rolando por baixo. */
export const RolandoPorBaixo: Story = {
  render: function RolandoPorBaixo(args) {
    const [ativa, setAtiva] = React.useState(CATEGORIAS[0]!.id);
    return (
      <div className="h-64 w-96 overflow-y-auto rounded-lg border border-border">
        <div className="h-12 bg-brand-faint" />
        <MoCategoryChips {...args} activeId={ativa} onSelect={setAtiva} />
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-16 rounded-md bg-border" />
          ))}
        </div>
      </div>
    );
  },
};

export const SemCategorias: Story = {
  args: { categories: [] },
};
