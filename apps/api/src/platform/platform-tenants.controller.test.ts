import { describe, expect, it, vi } from 'vitest';
import { PlatformTenantsController } from './platform-tenants.controller';
import type { RequestContextService } from '../context/request-context.service';
import type { PlatformProvisioningService } from './platform-provisioning.service';
import type { RequestWithUser } from '../auth/guards/jwt-auth.guard';

function makeContext(tenants: unknown[]) {
  const client = { tenant: { findMany: vi.fn().mockResolvedValue(tenants) } };
  return {
    run: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
    getClient: vi.fn().mockReturnValue(client),
  } as unknown as RequestContextService;
}

function makeProvisioning(result: unknown) {
  return { provision: vi.fn().mockResolvedValue(result) } as unknown as PlatformProvisioningService;
}

describe('PlatformTenantsController.list', () => {
  it('lista tenants não-deletados, sem status de soft-delete', async () => {
    const tenants = [{ id: 't1', slug: 'demo', name: 'Demo', planId: 'pro', status: 'active' }];
    const context = makeContext(tenants);
    const controller = new PlatformTenantsController(context, makeProvisioning(null));

    const result = await controller.list();

    expect(result).toEqual({ tenants });
    expect(context.run).toHaveBeenCalledWith({ tenantId: expect.any(String), isPlatform: true }, expect.any(Function));
  });

  it('lista vazia quando não há tenant nenhum', async () => {
    const context = makeContext([]);
    const controller = new PlatformTenantsController(context, makeProvisioning(null));

    const result = await controller.list();

    expect(result).toEqual({ tenants: [] });
  });
});

describe('PlatformTenantsController.provision', () => {
  it('delega pro PlatformProvisioningService dentro de contexto-plataforma, com o ator vindo do JWT', async () => {
    const context = makeContext([]);
    const provisionResult = {
      tenant: { id: 't1', slug: 'nova-loja', name: 'Nova Loja' },
      store: { id: 's1', name: 'Nova Loja' },
      ownerUserId: 'u1',
      ownerCreated: true,
    };
    const provisioning = makeProvisioning(provisionResult);
    const controller = new PlatformTenantsController(context, provisioning);
    const dto = { name: 'Nova Loja', plan: 'standard' as const, ownerEmail: 'dono@novaloja.com', ownerName: 'Dono', immediate: false };
    const req = { user: { sub: 'admin-1' } } as RequestWithUser;

    const result = await controller.provision(dto, req);

    expect(result).toEqual(provisionResult);
    expect(provisioning.provision).toHaveBeenCalledWith(dto, { id: 'admin-1', role: 'platform.superadmin' });
  });
});
