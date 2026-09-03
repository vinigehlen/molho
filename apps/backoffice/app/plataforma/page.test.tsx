import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleStateResponse } from '@molho/contracts';
import type { PlatformTenant } from '../../lib/platform-api';
import PlataformaPage from './page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchPlatformTenants: vi.fn(),
  fetchTenantModules: vi.fn(),
  setTenantEntitlement: vi.fn(),
  provisionStaff: vi.fn(),
  provisionTenant: vi.fn(),
  startImpersonation: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
  setStaffSession: vi.fn(),
}));

vi.mock('../../lib/platform-api', () => ({
  fetchPlatformTenants: mocks.fetchPlatformTenants,
  fetchTenantModules: mocks.fetchTenantModules,
  setTenantEntitlement: mocks.setTenantEntitlement,
  provisionStaff: mocks.provisionStaff,
  provisionTenant: mocks.provisionTenant,
  startImpersonation: mocks.startImpersonation,
}));
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('../../lib/staff-session', () => ({ setStaffSession: mocks.setStaffSession }));

const TENANT: PlatformTenant = { id: 'tenant-1', slug: 'demo', name: 'Demo', planId: 'pro', status: 'active' };
const MODULE: ModuleStateResponse = {
  moduleKey: 'coupons',
  entitled: false,
  enabled: false,
  released: true,
  active: false,
  source: null,
  status: null,
  trialEndsAt: null,
  plans: ['pro', 'premium'],
  requires: [],
  addon: false,
};

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<PlataformaPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Localiza o input pelo texto visível da label (MoInput sempre associa `htmlFor`/`id`) — imune a reordenação de campos na página. */
function getInputByLabel(text: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll('label')).find((l) => l.textContent === text);
  if (!label) throw new Error(`sem label "${text}"`);
  const id = label.getAttribute('for');
  const input = id ? document.getElementById(id) : null;
  if (!(input instanceof HTMLInputElement)) throw new Error(`label "${text}" não aponta pra um input`);
  return input;
}

function getButton(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  if (!button) throw new Error(`sem botão "${text}"`);
  return button;
}

async function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchPlatformTenants.mockResolvedValue([TENANT]);
  mocks.fetchTenantModules.mockResolvedValue([MODULE]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PlataformaPage — módulos', () => {
  it('lista tenants e carrega módulos ao selecionar um', async () => {
    await mount();
    expect(container.textContent).toContain('Demo (demo)');

    const select = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, TENANT.id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.fetchTenantModules).toHaveBeenCalledWith(TENANT.id);
    expect(container.textContent).toContain('coupons');
  });
});

describe('PlataformaPage — provisionar staff', () => {
  it('provisiona staff pelo formulário', async () => {
    mocks.provisionStaff.mockResolvedValue({ userId: 'u1', role: 'manager', scopeType: 'tenant', scopeId: TENANT.id, created: true });
    await mount();

    await setInput(getInputByLabel('E-mail do staff'), 'gerente@restaurante.com.br');
    await setInput(getInputByLabel('ID do tenant (scopeId)'), TENANT.id);

    await click(getButton('Provisionar'));

    expect(mocks.provisionStaff).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'gerente@restaurante.com.br', role: 'manager', scopeType: 'tenant', scopeId: TENANT.id }),
    );
    expect(container.textContent).toContain('Staff criado com sucesso.');
  });
});

describe('PlataformaPage — provisionar loja nova (Épico 14.6)', () => {
  it('provisiona um tenant pelo formulário e mostra o slug criado', async () => {
    mocks.provisionTenant.mockResolvedValue({
      tenant: { id: 'tenant-2', slug: 'nova-loja', name: 'Nova Loja' },
      store: { id: 'store-1', name: 'Nova Loja' },
      ownerUserId: 'u2',
      ownerCreated: true,
    });
    await mount();

    await setInput(getInputByLabel('Nome do restaurante'), 'Nova Loja');
    await setInput(getInputByLabel('E-mail do dono'), 'dono@novaloja.com');
    await setInput(getInputByLabel('Nome do dono'), 'Dono');

    await click(getButton('Provisionar loja'));

    expect(mocks.provisionTenant).toHaveBeenCalledWith({
      name: 'Nova Loja',
      plan: 'standard',
      ownerEmail: 'dono@novaloja.com',
      ownerName: 'Dono',
      immediate: false,
    });
    expect(container.textContent).toContain('nova-loja');
  });

  it('exige nome, e-mail e nome do dono antes de chamar a API', async () => {
    await mount();
    await click(getButton('Provisionar loja'));

    expect(container.textContent).toContain('Informe o nome do restaurante.');
    expect(mocks.provisionTenant).not.toHaveBeenCalled();
  });
});

describe('PlataformaPage — entrar como (impersonation, Épico 14)', () => {
  async function selectTenant() {
    const select = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, TENANT.id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('inicia impersonation somente-leitura por padrão e navega pro /gestor', async () => {
    mocks.startImpersonation.mockResolvedValue({
      accessToken: 'token-fake',
      tenantId: TENANT.id,
      tenantSlug: TENANT.slug,
      tenantName: TENANT.name,
      readOnly: true,
      expiresAt: '2026-01-01T00:30:00.000Z',
    });
    await mount();
    await selectTenant();
    await setInput(getInputByLabel('Motivo do acesso'), 'Investigar bug relatado pelo lojista.');

    await click(getButton(`Entrar como ${TENANT.name}`));

    expect(mocks.startImpersonation).toHaveBeenCalledWith(TENANT.id, {
      reason: 'Investigar bug relatado pelo lojista.',
      readOnly: true,
    });
    expect(mocks.setStaffSession).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'token-fake', tenantId: TENANT.id, tenantName: TENANT.name }),
    );
    expect(mocks.router.push).toHaveBeenCalledWith('/gestor');
  });

  it('exige motivo antes de chamar a API', async () => {
    await mount();
    await selectTenant();

    await click(getButton(`Entrar como ${TENANT.name}`));

    expect(container.textContent).toContain('Informe o motivo do acesso.');
    expect(mocks.startImpersonation).not.toHaveBeenCalled();
  });

  it('checkbox "Permitir escrita" manda readOnly:false', async () => {
    mocks.startImpersonation.mockResolvedValue({
      accessToken: 'token-fake',
      tenantId: TENANT.id,
      tenantSlug: TENANT.slug,
      tenantName: TENANT.name,
      readOnly: false,
      expiresAt: '2026-01-01T00:30:00.000Z',
    });
    await mount();
    await selectTenant();
    await setInput(getInputByLabel('Motivo do acesso'), 'Corrigir cupom criado errado a pedido do lojista.');

    const checkbox = Array.from(container.querySelectorAll('input[type="checkbox"]')).find((c) =>
      c.parentElement?.textContent?.includes('Permitir escrita'),
    ) as HTMLInputElement;
    await act(async () => {
      checkbox.click();
    });

    await click(getButton(`Entrar como ${TENANT.name}`));

    expect(mocks.startImpersonation).toHaveBeenCalledWith(
      TENANT.id,
      expect.objectContaining({ readOnly: false }),
    );
  });
});
