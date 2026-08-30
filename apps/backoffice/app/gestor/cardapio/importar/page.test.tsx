import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImportarCardapioPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  previewCatalogImport: vi.fn(),
  commitCatalogImport: vi.fn(),
}));

vi.mock('../../../../lib/catalog-import-api', () => ({
  previewCatalogImport: mocks.previewCatalogImport,
  commitCatalogImport: mocks.commitCatalogImport,
}));

const PREVIEW = {
  totalRows: 3,
  createdCount: 2,
  errorCount: 1,
  rows: [
    { line: 2, categoria: 'Carnes', produto: 'Picanha', status: 'valid' as const },
    { line: 3, categoria: 'Carnes', produto: 'Costela', status: 'valid' as const },
    { line: 4, categoria: 'Bebidas', produto: 'Guaraná', status: 'error' as const, error: 'Preço inválido' },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ImportarCardapioPage />);
    await Promise.resolve();
  });
}

async function pickFile() {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['col\nx'], 'cardapio.csv', { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function text() {
  return container.textContent ?? '';
}

function commitButton() {
  return [...container.querySelectorAll('button')].find((b) => /Importar \d/.test(b.textContent ?? '')) as
    | HTMLButtonElement
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.previewCatalogImport.mockResolvedValue(PREVIEW);
  mocks.commitCatalogImport.mockResolvedValue({ ...PREVIEW, createdCount: 2, rows: PREVIEW.rows });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ImportarCardapioPage', () => {
  it('mostra resumo, linhas válidas e linhas com erro após o preview', async () => {
    await mount();
    await pickFile();

    expect(mocks.previewCatalogImport).toHaveBeenCalledOnce();
    expect(text()).toContain('Picanha');
    expect(text()).toContain('Costela');
    expect(text()).toContain('Guaraná');
    expect(text()).toContain('Preço inválido');
    expect(text()).toContain('2 produtos serão criados');
    expect(text()).toContain('1 linha com erro');
  });

  it('exige consentimento explícito antes de liberar o commit', async () => {
    await mount();
    await pickFile();

    expect(commitButton()?.disabled).toBe(true);

    const consent = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      consent.click();
      await Promise.resolve();
    });
    expect(commitButton()?.disabled).toBe(false);

    await act(async () => {
      commitButton()!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.commitCatalogImport).toHaveBeenCalledOnce();
    expect(text()).toContain('2 produtos criados');
  });

  it('oferece "Voltar ao cardápio" a qualquer momento', async () => {
    await mount();
    const voltar = [...container.querySelectorAll('a')].find((a) => a.textContent?.includes('Voltar ao cardápio'));
    expect(voltar?.getAttribute('href')).toBe('/gestor/cardapio');
  });

  it('permite trocar o arquivo durante a revisão', async () => {
    await mount();
    await pickFile();
    expect(text()).toContain('Picanha');

    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => /Trocar arquivo/.test(b.textContent ?? ''))!.click();
      await Promise.resolve();
    });
    expect(text()).not.toContain('Picanha');
    expect(text()).toContain('Escolher planilha');
  });

  it('no resultado, leva de volta ao cardápio atualizado', async () => {
    await mount();
    await pickFile();
    const consent = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      consent.click();
      await Promise.resolve();
    });
    await act(async () => {
      commitButton()!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const ver = [...container.querySelectorAll('a')].find((a) => a.textContent?.includes('Ver cardápio atualizado'));
    expect(ver?.getAttribute('href')).toBe('/gestor/cardapio');
  });

  it('mostra erro e mantém a revisão quando o commit falha (permite retry)', async () => {
    mocks.commitCatalogImport.mockRejectedValueOnce(new Error('deu ruim no servidor'));
    await mount();
    await pickFile();

    const consent = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      consent.click();
      await Promise.resolve();
    });
    await act(async () => {
      commitButton()!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(text()).toContain('deu ruim no servidor');
    // ainda na tela de revisão: o botão de importar segue disponível pra tentar de novo
    expect(commitButton()).toBeDefined();

    mocks.commitCatalogImport.mockResolvedValueOnce({ ...PREVIEW, createdCount: 2 });
    await act(async () => {
      commitButton()!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.commitCatalogImport).toHaveBeenCalledTimes(2);
    expect(text()).toContain('2 produtos criados');
  });
});
