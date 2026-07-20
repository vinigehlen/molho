import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import { MoModifierGroup, type MoModifierOption } from './mo-modifier-group';

const meta: Meta<typeof MoModifierGroup> = {
  title: 'Domínio/MoModifierGroup',
  component: MoModifierGroup,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Escolha única (`max === 1`) usa `<input type="radio">` nativo agrupado por `name`. ' +
          'Consequência a saber ANTES de desenhar o fluxo: um grupo OPCIONAL de escolha única ' +
          '(`min === 0, max === 1`) não pode voltar a "nada selecionado" clicando de novo na opção ' +
          'já marcada — clicar um radio já marcado não dispara `change` em navegador nenhum, então ' +
          'não é bug deste componente, é limitação do próprio elemento nativo. Se o fluxo precisar ' +
          'de um estado "nenhum" nesse tipo de grupo, modele como um modificador explícito na lista ' +
          '(ex.: "Sem troca", delta R$ 0) — nunca com JS custom sobrescrevendo a semântica do input. ' +
          'Ver a story "Escolha Única Opcional" abaixo.',
      },
    },
  },
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

/**
 * Escolha única OPCIONAL (min=0, max=1). Clique numa opção pra marcá-la, e
 * repare: clicar DE NOVO na mesma opção não desmarca — é limitação do
 * `<input type="radio">` nativo (clicar um radio já marcado não dispara
 * `change` em navegador nenhum), não deste componente. Precisa de um estado
 * "nenhum" aqui? Adicione um modificador explícito na lista de opções (ex.:
 * "Sem molho", delta R$ 0) — não tente contornar em JS.
 */
export const EscolhaUnicaOpcional: Story = {
  args: {
    name: 'Molho extra (opcional)',
    min: 0,
    max: 1,
    options: [
      { id: 'sem', name: 'Sem molho extra', priceDeltaCents: 0 },
      { id: 'barbecue', name: 'Barbecue', priceDeltaCents: 200 },
      { id: 'especial', name: 'Molho especial da casa', priceDeltaCents: 300 },
    ],
    selectedIds: [],
  },
};

export const ComSelecaoJaFeita: Story = {
  args: { name: 'Adicionais', min: 0, max: 2, options: ADICIONAIS, selectedIds: ['bacon'] },
};

/** No teto: as opções que faltam ficam desabilitadas até algo ser desmarcado. */
export const NoTeto: Story = {
  args: { name: 'Adicionais', min: 0, max: 2, options: ADICIONAIS, selectedIds: ['bacon', 'ovo'] },
};
