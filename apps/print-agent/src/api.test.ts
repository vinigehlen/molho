import { describe, expect, it, vi } from 'vitest';
import { PrintDeviceRevokedError, PrintingApi } from './api.js';
import type { PrintAgentConfig } from './config.js';

const CONFIG: PrintAgentConfig = {
  apiUrl: 'https://api.staging.molho.live',
  deviceToken: 'molho_pd_abc',
  tenantId: 'tenant-1',
  workerId: 'agent-1',
  once: false,
  healthEvery: 20,
  width: 80,
  leaseSeconds: 120,
  pollMs: 3_000,
  printCommand: null,
  printArgs: [],
  printFormat: 'escpos',
  printerName: null,
  codepage: 'cp850',
};

describe('PrintingApi', () => {
  it('claim usa a rota do agente, Bearer do dispositivo e x-tenant-id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const api = new PrintingApi(CONFIG, fetchImpl);

    await expect(api.claimNext()).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith('https://api.staging.molho.live/v1/printing/agent/jobs/claim', {
      method: 'POST',
      headers: {
        authorization: 'Bearer molho_pd_abc',
        'content-type': 'application/json',
        'x-tenant-id': 'tenant-1',
      },
      body: JSON.stringify({ workerId: 'agent-1', leaseSeconds: 120, width: 80 }),
    });
  });

  it('omite x-tenant-id quando não configurado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new PrintingApi({ ...CONFIG, tenantId: null }, fetchImpl).claimNext();
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty('x-tenant-id');
  });

  it('401/403 vira PrintDeviceRevokedError', async () => {
    for (const status of [401, 403]) {
      const api = new PrintingApi(CONFIG, vi.fn().mockResolvedValue(new Response(null, { status })));
      await expect(api.claimNext()).rejects.toBeInstanceOf(PrintDeviceRevokedError);
    }
  });

  it('printed transforma 409 em corrida perdida', async () => {
    const api = new PrintingApi(CONFIG, vi.fn().mockResolvedValue(new Response(null, { status: 409 })));
    await expect(api.markPrinted({ id: 'job-1', version: 1 })).resolves.toBe(false);
  });
});
