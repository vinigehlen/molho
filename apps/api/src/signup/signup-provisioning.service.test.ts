import { describe, expect, it } from 'vitest';
import type { RequestContextService } from '../context/request-context.service';
import { SignupProvisioningService } from './signup-provisioning.service';

/** Só o pedaço de `Prisma.TransactionClient` que `checkSlugAvailability`
 * toca (`tenant.findFirst`) — fake em memória, sem banco real. */
function fakeRequestContext(takenSlugs: string[]): RequestContextService {
  const client = {
    tenant: {
      findFirst: async ({ where }: { where: { slug: string } }) =>
        takenSlugs.includes(where.slug) ? { id: `tenant-${where.slug}` } : null,
    },
  };
  return { getClient: () => client } as unknown as RequestContextService;
}

describe('SignupProvisioningService.checkSlugAvailability', () => {
  it('slug livre: available true, sem sugestão', async () => {
    const service = new SignupProvisioningService(fakeRequestContext([]));
    await expect(service.checkSlugAvailability('Cabanhas BBQ')).resolves.toEqual({ available: true });
  });

  it('slug ocupado: available false com sugestão -2', async () => {
    const service = new SignupProvisioningService(fakeRequestContext(['cabanhas-bbq']));
    await expect(service.checkSlugAvailability('Cabanhas BBQ')).resolves.toEqual({
      available: false,
      suggestion: 'cabanhas-bbq-2',
    });
  });

  it('slug e a próxima sugestão ocupados: pula pra -3', async () => {
    const service = new SignupProvisioningService(fakeRequestContext(['cabanhas-bbq', 'cabanhas-bbq-2']));
    await expect(service.checkSlugAvailability('Cabanhas BBQ')).resolves.toEqual({
      available: false,
      suggestion: 'cabanhas-bbq-3',
    });
  });

  it('nome só de símbolos cai no fallback loja-molho, ainda assim checado', async () => {
    const service = new SignupProvisioningService(fakeRequestContext(['loja-molho']));
    await expect(service.checkSlugAvailability('!!!')).resolves.toEqual({
      available: false,
      suggestion: 'loja-molho-2',
    });
  });
});
