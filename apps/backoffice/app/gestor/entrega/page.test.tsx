import React, { act, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DeliveryZoneResponse } from '@molho/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EntregaPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchMyStores: vi.fn(),
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

vi.mock('../../../lib/my-stores-api', () => ({
  fetchMyStores: mocks.fetchMyStores,
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

const STORE_A = { id: '0193f1a0-0000-7000-8000-000000000001', name: 'Loja Centro' };
const STORE_B = { id: '0193f1a0-0000-7000-8000-000000000002', name: 'Loja Zona Sul' };
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

async function selectStore(storeId: string) {
  const select = container.querySelector('select[aria-label="Loja"]');
  if (!(select instanceof HTMLSelectElement)) throw new Error('Seletor de loja não encontrado.');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, storeId);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function click(target: HTMLButtonElement) {
  await act(async () => {
    target.click();
    await Promise.resolve();
  });
}

/** Monta a página e deixa o efeito de montagem (fetchMyStores → load, se 1 loja só) assentar. */
async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<EntregaPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidSequence = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `0193f1a0-0000-7000-8000-${String(++uuidSequence).padStart(12, '0')}` });
  mocks.fetchMyStores.mockResolvedValue([STORE_A]);
  mocks.fetchDeliveryZones.mockResolvedValue([]);
  mocks.fetchStoreHours.mockResolvedValue({ shifts: [] });
  mocks.deleteDeliveryZone.mockResolvedValue(undefined);
  mocks.saveStoreHours.mockImplementation(async (_storeId, body) => body);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('EntregaPage — seletor de loja (Épico 6)', () => {
  it('1 loja só: pré-seleciona e carrega direto, sem dropdown', async () => {
    await mount();

    expect(container.querySelector('select[aria-label="Loja"]')).toBeNull();
    expect(container.querySelector('[aria-label="Loja ativa"]')?.textContent).toContain(STORE_A.name);
    expect(mocks.fetchDeliveryZones).toHaveBeenCalledWith(STORE_A.id);
    expect(input('Nome').disabled).toBe(false);
  });

  it('sem loja disponível: mensagem clara, nada pra editar', async () => {
    mocks.fetchMyStores.mockResolvedValueOnce([]);
    await mount();

    expect(container.textContent).toContain('Nenhuma loja disponível para esta conta.');
    expect(mocks.fetchDeliveryZones).not.toHaveBeenCalled();
  });

  it('2+ lojas: dropdown lista SÓ as lojas de /me/sessions/tenants, nenhuma opção fora dela', async () => {
    mocks.fetchMyStores.mockResolvedValue([STORE_A, STORE_B]);
    await mount();

    const select = container.querySelector('select[aria-label="Loja"]') as HTMLSelectElement;
    const optionValues = [...select.options].map((o) => o.value);
    expect(optionValues.sort()).toEqual([STORE_A.id, STORE_B.id].sort());
  });

  it('trocar de loja no dropdown recarrega zonas/horários da loja escolhida', async () => {
    mocks.fetchMyStores.mockResolvedValue([STORE_A, STORE_B]);
    mocks.fetchDeliveryZones.mockImplementation(async (id: string) => (id === STORE_B.id ? [ZONE] : []));
    await mount(); // 2+ lojas: nenhuma pré-selecionada, escolha é ativa

    await selectStore(STORE_A.id);
    expect(mocks.fetchDeliveryZones).toHaveBeenCalledWith(STORE_A.id);

    await selectStore(STORE_B.id);

    expect(mocks.fetchDeliveryZones).toHaveBeenCalledWith(STORE_B.id);
    expect(mocks.fetchStoreHours).toHaveBeenCalledWith(STORE_B.id);
    expect(container.querySelector('[aria-label="Loja ativa"]')?.textContent).toContain(STORE_B.name);
  });

  it('trava os editores enquanto a loja recém-escolhida ainda está carregando', async () => {
    mocks.fetchMyStores.mockResolvedValue([STORE_A, STORE_B]);
    await mount();
    expect(input('Nome').disabled).toBe(true); // 2+ lojas: nada carregado ainda

    await selectStore(STORE_A.id);
    expect(input('Nome').disabled).toBe(false);

    let resolveZones: ((zones: DeliveryZoneResponse[]) => void) | undefined;
    mocks.fetchDeliveryZones.mockReturnValueOnce(
      new Promise<DeliveryZoneResponse[]>((resolve) => {
        resolveZones = resolve;
      }),
    );

    await selectStore(STORE_B.id);
    expect(input('Nome').disabled).toBe(true);
    expect(button('Salvar horários').disabled).toBe(true);

    await act(async () => resolveZones?.([]));
    expect(input('Nome').disabled).toBe(false);
  });
});

describe('EntregaPage — segurança operacional', () => {
  it('pede confirmação com nome, cidade e UF antes de excluir', async () => {
    mocks.fetchDeliveryZones.mockResolvedValueOnce([ZONE]);
    await mount();

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
    mocks.fetchMyStores.mockResolvedValue([STORE_A, STORE_B]);
    await mount();
    await selectStore(STORE_A.id);
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
    expect((container.querySelector('select[aria-label="Loja"]') as HTMLSelectElement).disabled).toBe(true);
    expect(button('Salvando…').disabled).toBe(true);

    await act(async () => resolveCreate?.(ZONE));
    expect(input('Nome').disabled).toBe(false);
    expect(container.textContent).toContain('Zona criada.');
  });

  it('trava a grade e o seletor enquanto salva os horários', async () => {
    mocks.fetchMyStores.mockResolvedValue([STORE_A, STORE_B]);
    await mount();
    await selectStore(STORE_A.id);

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
    expect((container.querySelector('select[aria-label="Loja"]') as HTMLSelectElement).disabled).toBe(true);
    expect(button('Salvando…').disabled).toBe(true);

    await act(async () => resolveSave?.({ shifts: [] }));
    expect(button('Adicionar turno').disabled).toBe(false);
    expect(container.textContent).toContain('Horários salvos.');
  });
});
