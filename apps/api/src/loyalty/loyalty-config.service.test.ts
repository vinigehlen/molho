import { describe, expect, it } from 'vitest';
import { LoyaltyConfigConflictError } from './loyalty.errors';
import type { LoyaltyConfigRecord, LoyaltyConfigRepository } from './loyalty-config.repository';
import { LoyaltyConfigService } from './loyalty-config.service';

class FakeLoyaltyConfigRepository implements LoyaltyConfigRepository {
  row: LoyaltyConfigRecord | null = null;

  async get(): Promise<LoyaltyConfigRecord> {
    return this.row ?? { cashbackPercent: 5, version: 0 };
  }

  async update(cashbackPercent: number, expectedVersion: number): Promise<LoyaltyConfigRecord> {
    if (!this.row) {
      if (expectedVersion !== 0) throw new LoyaltyConfigConflictError();
      this.row = { cashbackPercent, version: 0 };
      return this.row;
    }
    if (this.row.version !== expectedVersion) throw new LoyaltyConfigConflictError();
    this.row = { cashbackPercent, version: this.row.version + 1 };
    return this.row;
  }
}

describe('LoyaltyConfigService', () => {
  it('get() sem configuração salva devolve a sugestão (D5), version 0', async () => {
    const service = new LoyaltyConfigService(new FakeLoyaltyConfigRepository());

    expect(await service.get()).toEqual({ cashbackPercent: 5, version: 0 });
  });

  it('update() com version 0 cria a primeira configuração do tenant', async () => {
    const service = new LoyaltyConfigService(new FakeLoyaltyConfigRepository());

    const updated = await service.update(10, 0);

    expect(updated).toEqual({ cashbackPercent: 10, version: 0 });
  });

  it('update() com version desatualizada: conflito, não sobrescreve', async () => {
    const repo = new FakeLoyaltyConfigRepository();
    repo.row = { cashbackPercent: 5, version: 2 };
    const service = new LoyaltyConfigService(repo);

    await expect(service.update(20, 1)).rejects.toThrow(LoyaltyConfigConflictError);
    expect(repo.row.cashbackPercent).toBe(5);
  });
});
