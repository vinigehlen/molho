import type { LoyaltyConfigRecord, LoyaltyConfigRepository } from './loyalty-config.repository';

export class LoyaltyConfigService {
  constructor(private readonly repo: LoyaltyConfigRepository) {}

  get(): Promise<LoyaltyConfigRecord> {
    return this.repo.get();
  }

  update(cashbackPercent: number, expectedVersion: number): Promise<LoyaltyConfigRecord> {
    return this.repo.update(cashbackPercent, expectedVersion);
  }
}
