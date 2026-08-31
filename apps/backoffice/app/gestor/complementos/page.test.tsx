import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ComplementosPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getStaffSession: vi.fn(),
  fetchAllModifierGroups: vi.fn(),
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
  fetchModifiers: vi.fn(),
  setModifierGroupActive: vi.fn(),
  updateModifierGroup: vi.fn(),
  createModifierGroup: vi.fn(),
  deleteModifierGroup: vi.fn(),
  copyModifierGroupForProduct: vi.fn(),
  linkModifierGroupToProduct: vi.fn(),
  unlinkModifierGroupFromProduct: vi.fn(),
  createModifier: vi.fn(),
  updateModifier: vi.fn(),
  deleteModifier: vi.fn(),
  reorderModifiers: vi.fn(),
  uploadModifierImage: vi.fn(),
}));

vi.mock('../../../lib/staff-session', () => ({ getStaffSession: mocks.getStaffSession }));
vi.mock('../../../lib/catalog-api', () => mocks);

const PIZZA = {
  id: 'prod-1',
  categoryId: 'cat-1',
  name: 'Pizza',
  description: null,
  basePriceCents: 4000,
  imageKey: null,
  available: true,
  pdvCode: null,
  sortOrder: 0,
  version: 0,
};
const PICANHA = { ...PIZZA, id: 'prod-2', name: 'Picanha', sortOrder: 1 };
const TAMANHO = {
  id: 'mg-1',
  productId: 'prod-1',
  productNames: ['Pizza'],
  productIds: ['prod-1'],
  name: 'Tamanho',
  min: 1,
  max: 1,
  active: true,
  pdvCode: null,
  version: 0,
};
const PONTO = {
  id: 'mg-2',
  productId: 'prod-2',
  productNames: ['Picanha'],
  productIds: ['prod-2'],
  name: 'Ponto da carne',
  min: 1,
  max: 1,
  active: true,
  pdvCode: 'PDV-42',
  version: 0,
};
const REUSED = {
  ...TAMANHO,
  productNames: ['Pizza', 'Picanha'],
  productIds: ['prod-1', 'prod-2'],
};
const BACON = {
  id: 'mod-1',
  groupId: 'mg-1',
  name: 'Bacon crocante',
  description: 'Duas fatias.',
  imageKey: null,
  imageUrl: null,
  priceDeltaCents: 500,
  active: true,
  pdvCode: 'BAC-1',
  sortOrder: 0,
  version: 0,
};

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ComplementosPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setInput(input: HTMLInputElement | null, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function clickButton(label: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  await act(async () => {
    button?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStaffSession.mockReturnValue({ accessToken: 't', tenantId: 'tenant-1', userId: 'u1', tenantName: 'Cabanhas' });
  mocks.fetchAllModifierGroups.mockResolvedValue([TAMANHO, PONTO]);
  mocks.fetchCategories.mockResolvedValue([{ id: 'cat-1', name: 'Pratos', sortOrder: 0, visible: true, version: 0 }]);
  mocks.fetchProducts.mockResolvedValue([PIZZA, PICANHA]);
  mocks.fetchModifiers.mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('ComplementosPage', () => {
  it('mostra skeleton enquanto carrega a biblioteca', async () => {
    mocks.fetchAllModifierGroups.mockReturnValue(new Promise(() => {}));
    mocks.fetchCategories.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(container.querySelector('[aria-label="Carregando grupos"]')).not.toBeNull();
  });

  it('lista a biblioteca inteira com produto, tipo e código do PDV', async () => {
    await mount();
    expect(container.textContent).toContain('Tamanho');
    expect(container.textContent).toContain('Pizza');
    expect(container.textContent).toContain('Ponto da carne');
    expect(container.textContent).toContain('Picanha');
    expect(container.textContent).toContain('PDV PDV-42');
    expect(container.textContent).toContain('Escolha única');
  });

  it('busca por produto e filtra grupos pausados', async () => {
    mocks.fetchAllModifierGroups.mockResolvedValue([{ ...TAMANHO, active: false }, PONTO]);
    await mount();
    await setInput(container.querySelector('[aria-label="Buscar grupo ou produto"]'), 'Pizza');
    expect(container.textContent).toContain('Tamanho');
    expect(container.textContent).not.toContain('Ponto da carne');

    await setInput(container.querySelector('[aria-label="Buscar grupo ou produto"]'), '');
    await clickButton('Pausados');
    expect(container.textContent).toContain('Tamanho');
    expect(container.textContent).not.toContain('Ponto da carne');
  });

  it('pausa um grupo sem apagar o histórico', async () => {
    mocks.setModifierGroupActive.mockResolvedValue({ ...TAMANHO, active: false });
    await mount();
    await clickButton('Pausar');
    expect(mocks.setModifierGroupActive).toHaveBeenCalledWith(TAMANHO, false);
    expect(container.textContent).toContain('Grupo pausado para o cliente.');
  });

  it('edita regras de um grupo usado por um produto', async () => {
    mocks.updateModifierGroup.mockResolvedValue({ ...TAMANHO, name: 'Tamanho da pizza' });
    await mount();
    await clickButton('Gerenciar');
    await setInput(container.querySelector('[aria-label="Nome do grupo"]'), 'Tamanho da pizza');
    await clickButton('Salvar regras');
    expect(mocks.updateModifierGroup).toHaveBeenCalledWith(TAMANHO, {
      name: 'Tamanho da pizza',
      min: 1,
      max: 1,
      pdvCode: null,
    });
  });

  it('avisa o impacto de grupo reutilizado e permite criar cópia para um produto', async () => {
    mocks.fetchAllModifierGroups.mockResolvedValue([REUSED]);
    mocks.copyModifierGroupForProduct.mockResolvedValue({ ...TAMANHO, id: 'mg-copy', name: 'Tamanho (cópia)' });
    await mount();
    await clickButton('Gerenciar');
    expect(container.textContent).toContain('Esta edição pode mudar 2 produtos');
    expect(container.textContent).toContain('Editar em todos');
    await clickButton('Criar cópia');
    expect(mocks.copyModifierGroupForProduct).toHaveBeenCalledWith('mg-1', 'prod-1');
  });

  it('confirma antes de desvincular um produto de grupo reutilizado', async () => {
    mocks.fetchAllModifierGroups.mockResolvedValue([REUSED]);
    mocks.unlinkModifierGroupFromProduct.mockResolvedValue(undefined);
    await mount();
    await clickButton('Gerenciar');

    const unlink = container.querySelector<HTMLButtonElement>('[aria-label="Desvincular Pizza"]');
    await act(async () => unlink?.click());
    expect(mocks.unlinkModifierGroupFromProduct).not.toHaveBeenCalled();
    expect(container.textContent).toContain('O grupo continua nos demais produtos.');

    await clickButton('Sim, desvincular');
    expect(mocks.unlinkModifierGroupFromProduct).toHaveBeenCalledWith('mg-1', 'prod-1');
  });

  it('cria grupo direto pela biblioteca', async () => {
    mocks.createModifierGroup.mockResolvedValue({ ...TAMANHO, id: 'mg-new', name: 'Molhos' });
    await mount();
    await clickButton('Novo grupo');
    await setInput(container.querySelector('input[placeholder="Ex.: Escolha o tamanho"]'), 'Molhos');
    await clickButton('Criar grupo');
    expect(mocks.createModifierGroup).toHaveBeenCalledWith({
      productId: 'prod-1',
      name: 'Molhos',
      min: 0,
      max: 1,
      pdvCode: null,
    });
  });

  it('pausa uma opção individual sem remover o grupo', async () => {
    mocks.fetchModifiers.mockResolvedValue([BACON]);
    mocks.updateModifier.mockResolvedValue({ ...BACON, active: false, version: 1 });
    await mount();
    await clickButton('Gerenciar');
    await clickButton('Disponível');
    expect(mocks.updateModifier).toHaveBeenCalledWith(BACON, { active: false });
  });
});
