import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import { MoStepper } from './mo-stepper';

const meta: Meta<typeof MoStepper> = {
  title: 'Fundamentos/MoStepper',
  component: MoStepper,
  args: { label: 'Quantidade de Filé à parmegiana', min: 1 },
  render: function Controlado(args) {
    const [qtd, setQtd] = React.useState(args.value ?? 1);
    return <MoStepper {...args} value={qtd} onChange={setQtd} />;
  },
};

export default meta;
type Story = StoryObj<typeof MoStepper>;

export const Padrao: Story = {
  args: { value: 1 },
};

/** No mínimo, o "−" desliga sozinho — não dá para pedir zero prato. */
export const NoMinimo: Story = {
  args: { value: 1, min: 1 },
};

/** Teto por item, quando a casa limita ("só 5 por pedido"). */
export const NoMaximo: Story = {
  args: { value: 5, max: 5 },
};

export const Desabilitado: Story = {
  args: { value: 2, disabled: true },
};
