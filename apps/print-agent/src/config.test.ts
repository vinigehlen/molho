import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

const BASE_ENV = {
  MOLHO_API_URL: 'https://api.staging.molho.live/',
  MOLHO_STAFF_ACCESS_TOKEN: 'token',
  MOLHO_TENANT_ID: 'tenant-1',
};

describe('readConfig', () => {
  it('lê o mínimo e aplica defaults seguros', () => {
    expect(readConfig(BASE_ENV)).toEqual({
      apiUrl: 'https://api.staging.molho.live',
      accessToken: 'token',
      tenantId: 'tenant-1',
      workerId: 'agent:tenant-1',
      width: 80,
      leaseSeconds: 120,
      pollMs: 3_000,
      printCommand: null,
      printArgs: [],
    });
  });

  it('aceita comando com args em JSON, sem shell', () => {
    expect(
      readConfig({
        ...BASE_ENV,
        MOLHO_PRINT_WORKER_ID: 'cozinha-1',
        MOLHO_PRINT_COMMAND: 'lp',
        MOLHO_PRINT_ARGS: '["-d","Cozinha"]',
      }),
    ).toMatchObject({
      workerId: 'cozinha-1',
      printCommand: 'lp',
      printArgs: ['-d', 'Cozinha'],
    });
  });

  it('rejeita args que não sejam array de strings', () => {
    expect(() => readConfig({ ...BASE_ENV, MOLHO_PRINT_ARGS: '{"shell":"nope"}' })).toThrow(/JSON array/);
  });
});
