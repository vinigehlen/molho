import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoInput } from './mo-input';

// Anotado em vez de `satisfies`: com `decorators`, o tipo inferido do meta não é
// nomeável sob o layout do pnpm (TS2742).
const meta: Meta<typeof MoInput> = {
  title: 'Fundamentos/MoInput',
  component: MoInput,
  parameters: { layout: 'padded' },
  args: {
    label: 'Nome do prato',
    placeholder: 'Ex.: Filé à parmegiana',
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MoInput>;

export const Padrao: Story = {};

export const ComAjuda: Story = {
  args: {
    label: 'Pedido mínimo',
    hint: 'Abaixo disso, o cliente não consegue fechar o carrinho.',
    mask: 'currency',
    placeholder: 'R$ 0,00',
  },
};

export const ComErro: Story = {
  args: {
    label: 'Slug da loja',
    defaultValue: 'gastro demo',
    error: 'Só letras, números e hífen — sem espaço.',
  },
};

/** O telefone é a identidade do cliente no Molho: máscara nativa, sempre. */
export const Telefone: Story = {
  args: { label: 'WhatsApp da loja', mask: 'phone', placeholder: '(11) 98765-4321' },
};

export const CpfOuCnpj: Story = {
  args: { label: 'CNPJ (opcional)', mask: 'cpfCnpj', placeholder: '12.345.678/0001-90' },
};

export const Cep: Story = {
  args: { label: 'CEP', mask: 'cep', placeholder: '01310-100' },
};

export const Desabilitado: Story = {
  args: { label: 'Domínio da loja', defaultValue: 'gastrodemo.molho.app', disabled: true },
};
