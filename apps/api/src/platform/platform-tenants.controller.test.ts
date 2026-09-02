import { describe, expect, it, vi } from 'vitest';
import { PlatformTenantsController } from './platform-tenants.controller';
import type { RequestContextService } from '../context/request-context.service';

function makeContext(tenants: unknown[]) {
  const client = { tenant: { findMany: vi.fn().mockResolvedValue(tenants) } };
  return {
    run: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
    getClient: vi.fn().mockReturnValue(client),
  } as unknown as RequestContextService;
}

describe('PlatformTenantsController.list', () => {
  it('lista tenants não-deletados, sem status de soft-delete', async () => {
    const tenants = [{ id: 't1', slug: 'demo', name: 'Demo', planId: 'pro', status: 'active' }];
    const context = makeContext(tenants);
    const controller = new PlatformTenantsController(context);

    const result = await controller.list();

    expect(result).toEqual({ tenants });
    expect(context.run).toHaveBeenCalledWith({ tenantId: expect.any(String), isPlatform: true }, expect.any(Function));
  });

  it('lista vazia quando não há tenant nenhum', async () => {
    const context = makeContext([]);
    const controller = new PlatformTenantsController(context);

    const result = await controller.list();

    expect(result).toEqual({ tenants: [] });
  });
});
