import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import { MoChip, MoChipGroup } from './mo-chip';

const meta = {
  title: 'Fundamentos/MoChip',
  component: MoChip,
  args: { children: 'Massas' },
} satisfies Meta<typeof MoChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

export const Selecionado: Story = {
  args: { selected: true },
};

export const Desabilitado: Story = {
  args: { disabled: true, children: 'Esgotado' },
};

/** Como o cardápio abre: categorias roláveis, uma selecionada. */
export const Categorias: Story = {
  parameters: { layout: 'padded' },
  render: function Categorias() {
    const categorias = ['Os mais pedidos', 'Massas', 'Filés', 'Risotos', 'Kids', 'Bebidas'];
    const [ativa, setAtiva] = React.useState('Massas');

    return (
      <div className="w-96">
        <MoChipGroup label="Categorias do cardápio">
          {categorias.map((c) => (
            <MoChip key={c} selected={ativa === c} onClick={() => setAtiva(c)}>
              {c}
            </MoChip>
          ))}
        </MoChipGroup>
      </div>
    );
  },
};
