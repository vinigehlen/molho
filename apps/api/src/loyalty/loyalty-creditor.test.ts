import { describe, expect, it } from 'vitest';
import type { LoyaltyGate } from '../modules/loyalty.gate';
import type { LoyaltyBalanceRepository } from './loyalty-balance.repository';
import type { LoyaltyConfigRecord, LoyaltyConfigRepository } from './loyalty-config.repository';
import { RealLoyaltyCreditor } from './loyalty-creditor';

class FakeGate implements LoyaltyGate {
  active = true;
  async isActive() {
    return this.active;
  }
}

class FakeConfigRepository implements LoyaltyConfigRepository {
  row: LoyaltyConfigRecord = { cashbackPercent: 5, version: 0 };
  async get() {
    return this.row;
  }
  async update() {
    return this.row;
  }
}

class FakeBalanceRepository implements LoyaltyBalanceRepository {
  creditCalls: { customerId: string; orderId: string; amountCents: number }[] = [];
  async getBalance() {
    return 0;
  }
  async credit(customerId: string, orderId: string, amountCents: number) {
    this.creditCalls.push({ customerId, orderId, amountCents });
  }
}

describe('RealLoyaltyCreditor.creditForCompletedOrder', () => {
  it('credita cashbackPercent% do total (D5), arredondado', async () => {
    const gate = new FakeGate();
    const config = new FakeConfigRepository();
    const balance = new FakeBalanceRepository();
    const creditor = new RealLoyaltyCreditor(gate, config, balance);

    await creditor.creditForCompletedOrder({ tenantId: 'tenant-1', customerId: 'customer-1', orderId: 'order-1', totalCents: 4999 });

    // 4999 * 5% = 249.95 → arredonda pra 250.
    expect(balance.creditCalls).toEqual([{ customerId: 'customer-1', orderId: 'order-1', amountCents: 250 }]);
  });

  it('módulo desligado (D7 revogado manualmente): não credita nada, nunca lança', async () => {
    const gate = new FakeGate();
    gate.active = false;
    const config = new FakeConfigRepository();
    const balance = new FakeBalanceRepository();
    const creditor = new RealLoyaltyCreditor(gate, config, balance);

    await creditor.creditForCompletedOrder({ tenantId: 'tenant-1', customerId: 'customer-1', orderId: 'order-1', totalCents: 10000 });

    expect(balance.creditCalls).toEqual([]);
  });
});
