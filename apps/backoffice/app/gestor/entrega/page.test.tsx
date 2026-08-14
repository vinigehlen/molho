import React, { act, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DeliveryZoneResponse } from '@molho/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EntregaPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getSavedStoreId: vi.fn(),
  saveStoreId: vi.fn(),
  fetchDeliveryZones: vi.fn(),
  createDeliveryZone: vi.fn(),
  updateDeliveryZone: vi.fn(),
  deleteDeliveryZone: vi.fn(),
  fetchStoreHours: vi.fn(),
  saveStoreHours: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('../../../lib/store-settings-store', () => ({
  getSavedStoreId: mocks.getSavedStoreId,
  saveStoreId: mocks.saveStoreId,
}));

vi.mock('../../../lib/delivery-zones-api', () => ({
  createDeliveryZone: mocks.createDeliveryZone,
  updateDeliveryZone: mocks.updateDeliveryZone,
  deleteDeliveryZone: mocks.deleteDeliveryZone,
  fetchDeliveryZones: mocks.fetchDeliveryZones,
  DeliveryZoneDuplicateError: class DeliveryZoneDuplicateError extends Error {},
}));

vi.mock('../../../lib/store-hours-api', () => ({
  fetchStoreHours: mocks.fetchStoreHours,
  saveStoreHours: mocks.saveStoreHours,
}));

const STORE_A = '0193f1a0-0000-7000-8000-000000000001';
const STORE_B = '0193f1a0-0000-7000-8000-000000000002';
const ZONE: DeliveryZoneResponse = {
  id: '0193f1a0-0000-7000-8000-000000000003',
  name: 'Centro',
  kind: 'city',
  city: 'Estância Velha',
  state: 'RS',
  feeCents: 800,
  etaMinMinutes: 30,
  etaMaxMinutes: 50,
  priority: 0,
};

let container: HTMLDivElement;
let root: Root;
let uuidSequence = 0;

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((element) => element.textContent?.trim() === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Botão não encontrado: ${label}`);
  return found;
}

function input(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')]
    .find((element) => element.querySelector('span')?.textContent?.trim() === label)
    ?.querySelector('input');
  if (!(found instanceof HTMLInputElement)) throw new Error(`Input não encontrado: ${label}`);
  return found;
}

async function changeInput(target: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(target: HTMLButtonElement) {
  await act(async () => {
    target.click();
    await Promise.resolve();
  });
}

async function loadStore(storeId = STORE_A) {
  const selector = container.querySelector('input[aria-label="ID da loja"]');
  if (!(selector instanceof HTMLInputElement)) throw new Error('Seletor de loja não encontrado.');
  await changeInput(selector, storeId);
  await click(button('Carregar'));
}

beforeEach(async () => {
  vi.clearAllMocks();
  uuidSequence = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `0193f1a0-0000-7000-8000-${String(++uuidSequence).padStart(12, '0')}` });
  mocks.getSavedStoreId.mockReturnValue('');
  mocks.fetchDeliveryZones.mockResolvedValue([]);
  mocks.fetchStoreHours.mockResolvedValue({ shifts: [] });
  mocks.deleteDeliveryZone.mockResolvedValue(undefined);
  mocks.saveStoreHours.mockImplementation(async (_storeId, body) => body);

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<EntregaPage />);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('EntregaPage — segurança operacional', () => {
  it('bloqueia os editores quando o ID digitado diverge da loja ativa e mantém o bloqueio após falha', async () => {
    await loadStore();
    expect(container.querySelector('[aria-label="Loja ativa"] code')?.textContent).toBe(STORE_A);
    expect(input('Nome').disabled).toBe(false);

    const selector = container.querySelector('input[aria-label="ID da loja"]') as HTMLInputElement;
    await changeInput(selector, STORE_B);

    expect(input('Nome').disabled).toBe(true);
    expect(button('Salvar horários').disabled).toBe(true);
    expect(container.textContent).toContain('O ID mudou. Carregue esta loja para liberar os editores.');

    mocks.fetchDeliveryZones.mockRejectedValueOnce(new Error('Loja não encontrada.'));
    await click(button('Carregar'));

    expect(container.querySelector('[aria-label="Loja ativa"] code')?.textContent).toBe(STORE_A);
    expect(input('Nome').disabled).toBe(true);
    expect(container.textContent).toContain('Loja não encontrada.');
  });

  it('pede confirmação com nome, cidade e UF antes de excluir', async () => {
    mocks.fetchDeliveryZones.mockResolvedValueOnce([ZONE]);
    await loadStore();

    await click(button('Excluir'));
    expect(mocks.deleteDeliveryZone).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('Excluir Centro?');
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('Estância Velha/RS');

    await click(button('Excluir Centro'));
    expect(mocks.deleteDeliveryZone).toHaveBeenCalledWith(ZONE.id);
    expect(container.textContent).toContain('Zona excluída.');
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('trava formulário e seletor enquanto salva uma zona', async () => {
    await loadStore();
    await changeInput(input('Nome'), 'Centro');
    await changeInput(input('Cidade'), 'Estância Velha');
    await changeInput(input('Taxa'), '8,00');

    let resolveCreate: ((zone: DeliveryZoneResponse) => void) | undefined;
    mocks.createDeliveryZone.mockReturnValueOnce(
      new Promise<DeliveryZoneResponse>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    await act(async () => {
      button('Criar zona').click();
      await Promise.resolve();
    });

    expect(input('Nome').disabled).toBe(true);
    expect((container.querySelector('input[aria-label="ID da loja"]') as HTMLInputElement).disabled).toBe(true);
    expect(button('Salvando…').disabled).toBe(true);

    await act(async () => resolveCreate?.(ZONE));
    expect(input('Nome').disabled).toBe(false);
    expect(container.textContent).toContain('Zona criada.');
  });

  it('trava a grade e o seletor enquanto salva os horários', async () => {
    await loadStore();

    let resolveSave: ((body: { shifts: [] }) => void) | undefined;
    mocks.saveStoreHours.mockReturnValueOnce(
      new Promise<{ shifts: [] }>((resolve) => {
        resolveSave = resolve;
      }),
    );

    await act(async () => {
      button('Salvar horários').click();
      await Promise.resolve();
    });

    expect(button('Adicionar turno').disabled).toBe(true);
    expect((container.querySelector('input[aria-label="ID da loja"]') as HTMLInputElement).disabled).toBe(true);
    expect(button('Salvando…').disabled).toBe(true);

    await act(async () => resolveSave?.({ shifts: [] }));
    expect(button('Adicionar turno').disabled).toBe(false);
    expect(container.textContent).toContain('Horários salvos.');
  });
});
