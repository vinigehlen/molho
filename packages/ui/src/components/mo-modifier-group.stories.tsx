import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import { MoModifierGroup, type MoModifierOption } from './mo-modifier-group';

const meta: Meta<typeof MoModifierGroup> = {
  title: 'Domínio/MoModifierGroup',
  component: MoModifierGroup,
  parameters: { layout: 'padded' },
  render: function Controlado(args) {
    const [selecionados, setSelecionados] = React.useState<string[]>(args.selectedIds);
    return <MoModifierGroup {...args} selectedIds={selecionados} onChange={setSelecionados} />;
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MoModifierGroup>;

const ADICIONAIS: MoModifierOption[] = [
  { id: 'bacon', name: 'Bacon', priceDeltaCents: 400 },
  { id: 'ovo', name: 'Ovo', priceDeltaCents: 300 },
  { id: 'queijo', name: 'Queijo extra', priceDeltaCents: 0 },
];

const PONTOS: MoModifierOption[] = [
  { id: 'mal', name: 'Mal passado', priceDeltaCents: 0 },
  { id: 'ponto', name: 'Ao ponto', priceDeltaCents: 0 },
  { id: 'bem', name: 'Bem passado', priceDeltaCents: 0 },
];

/** "Escolha até 2" — o exemplo literal do doc de marca §5.2. */
export const MultiplaEscolhaOpcional: Story = {
  args: { name: 'Adicionais', min: 0, max: 2, options: ADICIONAIS, selectedIds: [] },
};

/** Escolha única obrigatória: <input type="radio"> nativo, agrupado. */
export const EscolhaUnicaObrigatoria: Story = {
  args: { name: 'Ponto da carne', min: 1, max: 1, options: PONTOS, selectedIds: [] },
};

export const ComSelecaoJaFeita: Story = {
  args: { name: 'Adicionais', min: 0, max: 2, options: ADICIONAIS, selectedIds: ['bacon'] },
};

/** No teto: as opções que faltam ficam desabilitadas até algo ser desmarcado. */
export const NoTeto: Story = {
  args: { name: 'Adicionais', min: 0, max: 2, options: ADICIONAIS, selectedIds: ['bacon', 'ovo'] },
};
