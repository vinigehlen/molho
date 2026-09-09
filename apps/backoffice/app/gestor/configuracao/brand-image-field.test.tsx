import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandImageField, BRAND_IMAGE_SPEC } from './brand-image-field';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:mock');
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function fileInput(): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('BrandImageField', () => {
  it('mostra onde a imagem aparece e o limite de peso', () => {
    act(() => {
      root.render(<BrandImageField kind="logo" imageUrl={null} busy={false} onChange={() => {}} />);
    });
    expect(container.textContent).toContain('Foto de perfil redonda');
    expect(container.textContent).toContain('500 KB');
    expect(container.textContent).toContain('Sem imagem');
  });

  it('recusa formato fora de PNG/JPG/WebP sem abrir o editor', () => {
    act(() => {
      root.render(<BrandImageField kind="cover" imageUrl={null} busy={false} onChange={() => {}} />);
    });
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' });
    act(() => {
      Object.defineProperty(fileInput(), 'files', { value: [gif], configurable: true });
      fileInput().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('PNG, JPG ou WebP');
    expect(container.textContent).not.toContain('Ajuste o enquadramento');
  });

  it('abre o editor de enquadramento ao escolher um arquivo válido e fecha ao cancelar', () => {
    act(() => {
      root.render(<BrandImageField kind="logo" imageUrl={null} busy={false} onChange={() => {}} />);
    });
    const png = new File(['x'], 'logo.png', { type: 'image/png' });
    act(() => {
      Object.defineProperty(fileInput(), 'files', { value: [png], configurable: true });
      fileInput().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Ajuste o enquadramento');
    expect(container.querySelector('input[type="range"]')).not.toBeNull();

    const cancel = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Cancelar');
    act(() => cancel?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).not.toContain('Ajuste o enquadramento');
  });

  it('o recorte da capa é 1.91:1 e o da logo é quadrado', () => {
    expect(BRAND_IMAGE_SPEC.logo.aspect).toBe(1);
    expect(BRAND_IMAGE_SPEC.cover.aspect).toBeCloseTo(1200 / 630);
    expect(BRAND_IMAGE_SPEC.logo.outputMime).toBe('image/png');
    expect(BRAND_IMAGE_SPEC.cover.outputMime).toBe('image/jpeg');
  });
});
