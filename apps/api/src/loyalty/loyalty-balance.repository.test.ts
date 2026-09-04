import { describe, expect, it, vi } from 'vitest';
import type { RequestContextService } from '../context/request-context.service';
import { PrismaLoyaltyBalanceRepository } from './loyalty-balance.repository';

const TENANT_ID = 'tenant-1';

function fakeRequestContext(queryRawResult: unknown[]) {
  const client = { $queryRaw: vi.fn().mockResolvedValue(queryRawResult) };
  return {
    getClient: () => client,
    getTenantId: () => TENANT_ID,
  } as unknown as RequestContextService;
}

describe('PrismaLoyaltyBalanceRepository.listEvents', () => {
  it('mapeia snake_case do SQL cru pra camelCase, Date real no createdAt', async () => {
    const createdAt = new Date('2026-09-01T12:00:00.000Z');
    const context = fakeRequestContext([
      { type: 'earn', amount_cents: 250, order_id: 'order-1', created_at: createdAt },
      { type: 'redeem', amount_cents: 100, order_id: 'order-2', created_at: createdAt },
    ]);
    const repo = new PrismaLoyaltyBalanceRepository(context);

    const events = await repo.listEvents('customer-1');

    expect(events).toEqual([
      { type: 'earn', amountCents: 250, orderId: 'order-1', createdAt },
      { type: 'redeem', amountCents: 100, orderId: 'order-2', createdAt },
    ]);
  });

  it('lista vazia quando o cliente não tem earn nem redeem nenhum', async () => {
    const context = fakeRequestContext([]);
    const repo = new PrismaLoyaltyBalanceRepository(context);

    await expect(repo.listEvents('customer-1')).resolves.toEqual([]);
  });

  it('default limit é 50 quando não passado', async () => {
    const context = fakeRequestContext([]);
    const repo = new PrismaLoyaltyBalanceRepository(context);

    await repo.listEvents('customer-1');

    const client = context.getClient() as unknown as { $queryRaw: ReturnType<typeof vi.fn> };
    const [, ...values] = client.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(values).toContain(50);
  });
});
