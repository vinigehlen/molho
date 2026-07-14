import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import { formatCents } from '../lib/format';
import { MoButton } from './mo-button';
import { MoSheet } from './mo-sheet';
import { MoStepper } from './mo-stepper';

const meta: Meta<typeof MoSheet> = {
  title: 'Fundamentos/MoSheet',
  component: MoSheet,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof MoSheet>;

/** O sheet fechado — é assim que ele nasce. O botão é o gatilho. */
export const Fechado: Story = {
  render: function Fechado() {
    const [aberto, setAberto] = React.useState(false);

    return (
      <>
        <MoButton onClick={() => setAberto(true)}>Ver o prato</MoButton>
        <MoSheet
          open={aberto}
          onOpenChange={setAberto}
          title="Filé à parmegiana"
          description="Serve 2 pessoas. Acompanha arroz e fritas."
        >
          <p className="pb-6">
            No capricho: filé empanado na hora, molho da casa e muito queijo derretido.
          </p>
        </MoSheet>
      </>
    );
  },
};

/** Detalhe do produto: o uso número 1 do sheet no storefront. */
export const DetalheDoProduto: Story = {
  render: function DetalheDoProduto() {
    const [aberto, setAberto] = React.useState(true);
    const [qtd, setQtd] = React.useState(1);

    return (
      <>
        <MoButton onClick={() => setAberto(true)}>Abrir de novo</MoButton>
        <MoSheet
          open={aberto}
          onOpenChange={setAberto}
          title="Filé à parmegiana"
          description="Serve 2 pessoas. Acompanha arroz e fritas."
          footer={
            <>
              <MoStepper
                value={qtd}
                onChange={setQtd}
                label="Quantidade de Filé à parmegiana"
                max={10}
              />
              <MoButton fullWidth onClick={() => setAberto(false)}>
                Adicionar • {formatCents(8990 * qtd)}
              </MoButton>
            </>
          }
        >
          <p className="pb-6">
            No capricho: filé empanado na hora, molho da casa e muito queijo derretido.
          </p>
        </MoSheet>
      </>
    );
  },
};
