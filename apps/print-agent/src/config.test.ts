import { describe, expect, it } from 'vitest';
import { readConfig, readOutputConfig } from './config.js';

const BASE_ENV = {
  MOLHO_API_URL: 'https://api.staging.molho.live/',
  MOLHO_PRINT_DEVICE_TOKEN: 'molho_pd_abc',
};

describe('readConfig', () => {
  it('lê o mínimo (só API + token de dispositivo) e aplica defaults seguros', () => {
    expect(readConfig(BASE_ENV)).toEqual({
      apiUrl: 'https://api.staging.molho.live',
      deviceToken: 'molho_pd_abc',
      tenantId: null,
      workerId: 'agent:device',
      once: false,
      healthEvery: 20,
      width: 80,
      leaseSeconds: 120,
      pollMs: 3_000,
      printCommand: null,
      printArgs: [],
      printFormat: 'text',
      printerName: null,
      codepage: 'cp850',
    });
  });

  it('usa MOLHO_TENANT_ID quando presente e deriva o workerId dele', () => {
    expect(readConfig({ ...BASE_ENV, MOLHO_TENANT_ID: 'tenant-1' })).toMatchObject({
      tenantId: 'tenant-1',
      workerId: 'agent:tenant-1',
    });
  });

  it('exige MOLHO_PRINT_DEVICE_TOKEN', () => {
    expect(() => readConfig({ MOLHO_API_URL: 'https://x' })).toThrow(/MOLHO_PRINT_DEVICE_TOKEN/);
  });

  it('aceita nome de impressora, codepage e comando explícito', () => {
    expect(
      readConfig({
        ...BASE_ENV,
        MOLHO_PRINTER_NAME: 'Elgin i7',
        MOLHO_PRINT_CODEPAGE: 'cp860',
        MOLHO_PRINT_FORMAT: 'escpos',
      }),
    ).toMatchObject({ printerName: 'Elgin i7', codepage: 'cp860', printFormat: 'escpos' });
  });

  it('rejeita codepage e formato desconhecidos', () => {
    expect(() => readConfig({ ...BASE_ENV, MOLHO_PRINT_CODEPAGE: 'utf8' })).toThrow(/cp850.*cp860.*ascii/);
    expect(() => readConfig({ ...BASE_ENV, MOLHO_PRINT_FORMAT: 'pdf' })).toThrow(/text.*escpos/);
  });

  it('rejeita args que não sejam array de strings', () => {
    expect(() => readConfig({ ...BASE_ENV, MOLHO_PRINT_ARGS: '{"shell":"nope"}' })).toThrow(/JSON array/);
  });
});

describe('readOutputConfig', () => {
  it('não exige API/token para cupom de teste local', () => {
    expect(readOutputConfig({ MOLHO_PRINT_FORMAT: 'escpos', MOLHO_PRINTER_NAME: 'i7' })).toEqual({
      printCommand: null,
      printArgs: [],
      printFormat: 'escpos',
      printerName: 'i7',
      codepage: 'cp850',
    });
  });
});
