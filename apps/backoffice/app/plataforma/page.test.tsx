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
}));

vi.mock('../../lib/platform-api', () => ({
  fetchPlatformTenants: mocks.fetchPlatformTenants,
  fetchTenantModules: mocks.fetchTenantModules,
  setTenantEntitlement: mocks.setTenantEntitlement,
  provisionStaff: mocks.provisionStaff,
}));

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

async function setInput(input: HTMLInputElement | null, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
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

describe('PlataformaPage', () => {
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

  it('provisiona staff pelo formulário', async () => {
    mocks.provisionStaff.mockResolvedValue({ userId: 'u1', role: 'manager', scopeType: 'tenant', scopeId: TENANT.id, created: true });
    await mount();

    const inputs = container.querySelectorAll('input');
    await setInput(inputs[0] as HTMLInputElement, 'gerente@restaurante.com.br'); // e-mail
    await setInput(inputs[1] as HTMLInputElement, TENANT.id); // scopeId

    const botao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Provisionar');
    await act(async () => {
      botao?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.provisionStaff).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'gerente@restaurante.com.br', role: 'manager', scopeType: 'tenant', scopeId: TENANT.id }),
    );
    expect(container.textContent).toContain('Staff criado com sucesso.');
  });
});
