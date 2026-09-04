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
  // null por padrão: representa "lojista nunca salvou nada" — o creditor
  // (16.4) tem que tratar isso como desligado, nunca como "usa a sugestão".
  row: LoyaltyConfigRecord | null = null;
  async find() {
    return this.row;
  }
  async get() {
    return this.row ?? { cashbackPercent: 5, version: 0 };
  }
  async update() {
    return this.row ?? { cashbackPercent: 5, version: 0 };
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
  it('credita cashbackPercent% do total (D5), arredondado — com config REALMENTE salva pelo lojista', async () => {
    const gate = new FakeGate();
    const config = new FakeConfigRepository();
    config.row = { cashbackPercent: 5, version: 1 }; // já passou por um PUT — configurado de verdade
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
    config.row = { cashbackPercent: 5, version: 1 };
    const balance = new FakeBalanceRepository();
    const creditor = new RealLoyaltyCreditor(gate, config, balance);

    await creditor.creditForCompletedOrder({ tenantId: 'tenant-1', customerId: 'customer-1', orderId: 'order-1', totalCents: 10000 });

    expect(balance.creditCalls).toEqual([]);
  });

  it('16.4: SEM config salva (lojista nunca abriu a tela de fidelidade) — fail-closed, não credita a sugestão de 5%', async () => {
    const gate = new FakeGate();
    const config = new FakeConfigRepository();
    config.row = null; // nunca salvou nada
    const balance = new FakeBalanceRepository();
    const creditor = new RealLoyaltyCreditor(gate, config, balance);

    await creditor.creditForCompletedOrder({ tenantId: 'tenant-1', customerId: 'customer-1', orderId: 'order-1', totalCents: 10000 });

    expect(balance.creditCalls).toEqual([]);
  });

  it('config salva com version:0 (primeiro save de verdade) AINDA credita — 0 é versão válida, não "não configurado"', async () => {
    const gate = new FakeGate();
    const config = new FakeConfigRepository();
    config.row = { cashbackPercent: 8, version: 0 }; // Prisma cria com version default 0
    const balance = new FakeBalanceRepository();
    const creditor = new RealLoyaltyCreditor(gate, config, balance);

    await creditor.creditForCompletedOrder({ tenantId: 'tenant-1', customerId: 'customer-1', orderId: 'order-1', totalCents: 10000 });

    expect(balance.creditCalls).toEqual([{ customerId: 'customer-1', orderId: 'order-1', amountCents: 800 }]);
  });
});
