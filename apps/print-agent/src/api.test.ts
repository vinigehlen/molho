import { describe, expect, it, vi } from 'vitest';
import { PrintingApi } from './api.js';
import type { PrintAgentConfig } from './config.js';

const CONFIG: PrintAgentConfig = {
  apiUrl: 'https://api.staging.molho.live',
  accessToken: 'token',
  tenantId: 'tenant-1',
  workerId: 'agent-1',
  width: 80,
  leaseSeconds: 120,
  pollMs: 3_000,
  printCommand: null,
  printArgs: [],
  printFormat: 'text',
};

describe('PrintingApi', () => {
  it('claim envia auth, tenant, lease e largura', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const api = new PrintingApi(CONFIG, fetchImpl);

    await expect(api.claimNext()).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith('https://api.staging.molho.live/v1/admin/printing/jobs/claim', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
        'x-tenant-id': 'tenant-1',
      },
      body: JSON.stringify({ workerId: 'agent-1', leaseSeconds: 120, width: 80 }),
    });
  });

  it('printed transforma 409 em corrida perdida', async () => {
    const api = new PrintingApi(CONFIG, vi.fn().mockResolvedValue(new Response(null, { status: 409 })));

    await expect(api.markPrinted({ id: 'job-1', version: 1 })).resolves.toBe(false);
  });
});
