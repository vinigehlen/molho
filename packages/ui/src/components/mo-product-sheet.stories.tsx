import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import { MoButton } from './mo-button';
import { MoProductSheet, type MoProductSheetProduct, type MoProductSheetSelection } from './mo-product-sheet';

const X_BURGER: MoProductSheetProduct = {
  id: 'prod-1',
  name: 'X-Burger',
  description: 'Pão brioche, blend 180g, queijo prato e maionese da casa.',
  imageUrl: null,
  basePriceCents: 2890,
  modifierGroups: [
    {
      id: 'ponto',
      name: 'Ponto da carne',
      min: 1,
      max: 1,
      modifiers: [
        { id: 'mal', name: 'Mal passado', priceDeltaCents: 0 },
        { id: 'ponto', name: 'Ao ponto', priceDeltaCents: 0 },
        { id: 'bem', name: 'Bem passado', priceDeltaCents: 0 },
      ],
    },
    {
      id: 'adicionais',
      name: 'Adicionais',
      min: 0,
      max: 3,
      modifiers: [
        { id: 'bacon', name: 'Bacon', priceDeltaCents: 400 },
        { id: 'ovo', name: 'Ovo', priceDeltaCents: 300 },
        { id: 'queijo', name: 'Queijo extra', priceDeltaCents: 500 },
      ],
    },
  ],
};

const BATATA: MoProductSheetProduct = {
  id: 'prod-2',
  name: 'Batata frita',
  description: 'Porção generosa, sequinha, sal na medida certa.',
  imageUrl: null,
  basePriceCents: 1500,
  modifierGroups: [],
};

const meta: Meta<typeof MoProductSheet> = {
  title: 'Domínio/MoProductSheet',
  component: MoProductSheet,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof MoProductSheet>;

/** Blueprint "Detalhe do produto" (doc de marca §5.3, item 2), composto de verdade. */
export const ComModificadores: Story = {
  render: function ComModificadores() {
    const [aberto, setAberto] = React.useState(true);
    const [ultimaAdicao, setUltimaAdicao] = React.useState<MoProductSheetSelection | null>(null);

    function adicionar(selecao: MoProductSheetSelection) {
      setUltimaAdicao(selecao);
      setAberto(false);
    }

    return (
      <>
        <div className="flex flex-col items-center gap-2">
          <MoButton onClick={() => setAberto(true)}>Abrir X-Burger</MoButton>
          {ultimaAdicao ? (
            <p className="text-caption text-text-muted">
              Adicionado: {ultimaAdicao.quantity}× · {ultimaAdicao.modifiers.length} modificador(es)
            </p>
          ) : null}
        </div>
        <MoProductSheet open={aberto} onOpenChange={setAberto} product={X_BURGER} onAddToCart={adicionar} />
      </>
    );
  },
};

/** Produto sem nenhum grupo de modificador: só quantidade e observação. */
export const SemModificadores: Story = {
  render: function SemModificadores() {
    const [aberto, setAberto] = React.useState(true);
    return (
      <>
        <MoButton onClick={() => setAberto(true)}>Abrir Batata frita</MoButton>
        <MoProductSheet open={aberto} onOpenChange={setAberto} product={BATATA} onAddToCart={() => setAberto(false)} />
      </>
    );
  },
};

/** Grupo obrigatório vazio: o botão "Adicionar" nasce desabilitado. */
export const GrupoObrigatorioIncompleto: Story = {
  args: { open: true, product: X_BURGER, onOpenChange: () => {}, onAddToCart: () => {} },
};
