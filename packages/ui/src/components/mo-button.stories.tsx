import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus, ShoppingBag } from 'lucide-react';
import { MoButton } from './mo-button';

const meta = {
  title: 'Fundamentos/MoButton',
  component: MoButton,
  args: {
    children: 'Adicionar ao carrinho',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'pix'],
    },
    size: { control: 'inline-radio', options: ['md', 'sm'] },
  },
} satisfies Meta<typeof MoButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primario: Story = {
  args: { variant: 'primary' },
};

export const Secundario: Story = {
  args: { variant: 'secondary', children: 'Ver cardápio' },
};

export const Fantasma: Story = {
  args: { variant: 'ghost', children: 'Agora não' },
};

export const Perigo: Story = {
  args: { variant: 'danger', children: 'Cancelar pedido' },
};

/** A cor do PIX é do Banco Central — não acompanha o tema do lojista. */
export const Pix: Story = {
  args: { variant: 'pix', children: 'Copiar código PIX' },
};

export const ComIcone: Story = {
  args: { icon: <Plus />, children: 'Novo produto' },
};

/** O botão não encolhe enquanto carrega — a largura é a mesma do estado normal. */
export const Carregando: Story = {
  args: { loading: true, children: 'Enviando comanda' },
};

export const Desabilitado: Story = {
  args: { disabled: true, children: 'Loja fechada' },
};

export const LarguraTotal: Story = {
  args: { fullWidth: true, icon: <ShoppingBag />, children: 'Finalizar pedido • R$ 89,90' },
  parameters: { layout: 'padded' },
};

export const TodasAsVariantes: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <MoButton variant="primary">Primário</MoButton>
      <MoButton variant="secondary">Secundário</MoButton>
      <MoButton variant="ghost">Fantasma</MoButton>
      <MoButton variant="danger">Perigo</MoButton>
      <MoButton variant="pix">PIX</MoButton>
    </div>
  ),
};
