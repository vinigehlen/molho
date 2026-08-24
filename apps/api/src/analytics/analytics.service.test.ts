import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  it('mantem ranking de clientes quando um telefone nao pode ser descriptografado', async () => {
    const client = {
      store: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: 'store-1' }),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        {
          customerId: 'customer-1',
          nomeMascarado: 'Cliente Teste',
          phoneCiphertext: Buffer.from('ciphertext-invalido'),
          phoneKeyVersion: 1,
          pedidos: 2n,
          faturamentoCents: 5900n,
        },
      ]),
    };
    const service = new AnalyticsService({ getClient: () => client } as never);

    await expect(
      service.customers(
        '00000000-0000-0000-0000-000000000000',
        { from: new Date('2026-08-01T00:00:00.000Z'), to: new Date('2026-08-22T23:59:59.999Z') },
        10,
      ),
    ).resolves.toEqual([
      {
        customerId: 'customer-1',
        nomeMascarado: 'Cliente Teste',
        telefoneMascarado: null,
        pedidos: 2,
        faturamentoCents: 5900,
      },
    ]);
  });
});
