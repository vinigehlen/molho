import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ComplementosPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getStaffSession: vi.fn(),
  fetchAllModifierGroups: vi.fn(),
  fetchModifiers: vi.fn(),
  setModifierGroupActive: vi.fn(),
  updateModifierGroup: vi.fn(),
  createModifier: vi.fn(),
}));

vi.mock('../../../lib/staff-session', () => ({ getStaffSession: mocks.getStaffSession }));
vi.mock('../../../lib/catalog-api', () => ({
  fetchAllModifierGroups: mocks.fetchAllModifierGroups,
  fetchModifiers: mocks.fetchModifiers,
  setModifierGroupActive: mocks.setModifierGroupActive,
  updateModifierGroup: mocks.updateModifierGroup,
  createModifier: mocks.createModifier,
}));

const TAMANHO = { id: 'mg-1', productId: 'prod-1', productNames: ['Pizza'], productIds: ['prod-1'], name: 'Tamanho', min: 1, max: 1, active: true, pdvCode: null, version: 0 };
const PONTO = { id: 'mg-2', productId: 'prod-2', productNames: ['Picanha'], productIds: ['prod-2'], name: 'Ponto da carne', min: 1, max: 1, active: true, pdvCode: 'PDV-42', version: 0 };

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStaffSession.mockReturnValue({ accessToken: 't', tenantId: 'tenant-1', userId: 'u1', tenantName: 'Cabanhas' });
  mocks.fetchAllModifierGroups.mockResolvedValue([TAMANHO, PONTO]);
  mocks.fetchModifiers.mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('ComplementosPage', () => {
  it('lista grupos de TODOS os produtos, com o nome do produto dono', async () => {
    await mount();
    expect(container.textContent).toContain('Tamanho');
    expect(container.textContent).toContain('Pizza');
    expect(container.textContent).toContain('Ponto da carne');
    expect(container.textContent).toContain('Picanha');
    expect(container.textContent).toContain('PDV-42');
  });

  it('busca filtra por nome do grupo OU do produto', async () => {
    await mount();
    const search = container.querySelector<HTMLInputElement>('[aria-label="Buscar grupo ou produto"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(search, 'Picanha');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('Ponto da carne');
    expect(container.textContent).not.toContain('Tamanho');
  });

  it('pausar chama setModifierGroupActive(group, false)', async () => {
    mocks.setModifierGroupActive.mockResolvedValue({ ...TAMANHO, active: false });
    await mount();

    const badge = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'ativo');
    await act(async () => {
      badge?.click();
      await Promise.resolve();
    });

    expect(mocks.setModifierGroupActive).toHaveBeenCalledWith(TAMANHO, false);
  });

  it('editar grupo: muda nome/min/max/PDV e salva', async () => {
    mocks.updateModifierGroup.mockResolvedValue({ ...TAMANHO, name: 'Tamanho da pizza', pdvCode: 'T-1' });
    await mount();

    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Editar')?.click();
    });

    const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="Nome do grupo"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(nameInput, 'Tamanho da pizza');
      nameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Salvar grupo')?.click();
      await Promise.resolve();
    });

    expect(mocks.updateModifierGroup).toHaveBeenCalledWith(TAMANHO, { name: 'Tamanho da pizza', min: 1, max: 1, pdvCode: null });
  });
});
