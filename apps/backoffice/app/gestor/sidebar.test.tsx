import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './sidebar';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ pathname: '/gestor' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));

let container: HTMLDivElement;
let root: Root;

function baseProps() {
  return {
    tenantName: 'Hamburgueria da Vila',
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    mobileOpen: false,
    onCloseMobile: vi.fn(),
    onLogout: vi.fn(),
    loggingOut: false,
  };
}

async function render(props: ReturnType<typeof baseProps>): Promise<void> {
  await act(async () => {
    root.render(<Sidebar {...props} />);
  });
}

beforeEach(() => {
  mocks.pathname = '/gestor';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Sidebar', () => {
  it('marca a rota ativa e deixa as outras sem aria-current', async () => {
    mocks.pathname = '/gestor/balcao';
    await render(baseProps());

    const active = container.querySelector('a[aria-current="page"]');
    expect(active?.textContent).toContain('Balcão');
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
  });

  it('item único de Promoções acende também em /gestor/cupons e /gestor/fidelidade', async () => {
    mocks.pathname = '/gestor/cupons';
    await render(baseProps());

    const active = container.querySelector('a[aria-current="page"]');
    expect(active?.getAttribute('href')).toBe('/gestor/promocoes');
    expect(active?.textContent).toContain('Promoções');
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
    // Cupons e Fidelidade não têm mais entrada própria na sidebar.
    const hrefs = [...container.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/gestor/cupons');
    expect(hrefs).not.toContain('/gestor/fidelidade');
  });

  it('Balcão é o segundo item da navegação', async () => {
    await render(baseProps());
    const hrefs = [...container.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    expect(hrefs.slice(0, 2)).toEqual(['/gestor', '/gestor/balcao']);
  });

  it('colapsado: labels somem visualmente (sr-only) mas continuam no DOM pro leitor de tela', async () => {
    await render({ ...baseProps(), collapsed: true });

    const label = [...container.querySelectorAll('span')].find((s) => s.textContent === 'Pedidos');
    expect(label?.className).toContain('sr-only');
  });

  it('botão de colapsar chama onToggleCollapsed', async () => {
    const props = baseProps();
    await render(props);

    const toggle = container.querySelector('button[aria-label="Recolher menu"]') as HTMLButtonElement;
    toggle.click();
    expect(props.onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it('overlay mobile: fechado por padrão, sem o painel no DOM', async () => {
    await render(baseProps());
    expect(container.querySelector('aside.absolute')).toBeNull();
  });

  it('overlay mobile aberto: clique no backdrop fecha, sem disparar logout', async () => {
    const props = { ...baseProps(), mobileOpen: true };
    await render(props);

    const backdrop = container.querySelector('button[aria-label="Fechar menu"]') as HTMLButtonElement;
    backdrop.click();
    expect(props.onCloseMobile).toHaveBeenCalledOnce();
    expect(props.onLogout).not.toHaveBeenCalled();
  });

  it('Sair desabilitado e com texto de progresso durante loggingOut', async () => {
    await render({ ...baseProps(), loggingOut: true });

    const sair = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Saindo'));
    expect(sair).toBeInstanceOf(HTMLButtonElement);
    expect((sair as HTMLButtonElement).disabled).toBe(true);
  });
});
