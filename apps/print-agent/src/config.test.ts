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
      printFormat: 'text',
    });
  });

  it('aceita comando com args em JSON, sem shell', () => {
    expect(
      readConfig({
        ...BASE_ENV,
        MOLHO_PRINT_WORKER_ID: 'cozinha-1',
        MOLHO_PRINT_COMMAND: 'lp',
        MOLHO_PRINT_ARGS: '["-d","Cozinha"]',
        MOLHO_PRINT_FORMAT: 'escpos',
      }),
    ).toMatchObject({
      workerId: 'cozinha-1',
      printCommand: 'lp',
      printArgs: ['-d', 'Cozinha'],
      printFormat: 'escpos',
    });
  });

  it('rejeita args que não sejam array de strings', () => {
    expect(() => readConfig({ ...BASE_ENV, MOLHO_PRINT_ARGS: '{"shell":"nope"}' })).toThrow(/JSON array/);
  });

  it('rejeita formato de impressão desconhecido', () => {
    expect(() => readConfig({ ...BASE_ENV, MOLHO_PRINT_FORMAT: 'pdf' })).toThrow(/text.*escpos/);
  });
});
