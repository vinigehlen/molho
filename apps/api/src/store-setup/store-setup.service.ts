import type { UpdateStoreSetupInput } from '@molho/contracts';
import type { StoreSetupRepository } from './store-setup.repository';
import { StoreSetupValidationError } from './store-setup.errors';

export class StoreSetupService {
  constructor(private readonly repo: StoreSetupRepository) {}

  get(storeId: string, actorId?: string) {
    return this.repo.get(storeId, actorId);
  }

  async update(storeId: string, input: UpdateStoreSetupInput, actorId?: string) {
    if (input.pixKey && (!input.pixKeyType || !input.pixMerchantCity)) {
      throw new StoreSetupValidationError('Para vender por PIX, informe tipo da chave e cidade do recebedor.');
    }
    return this.repo.update(storeId, input, actorId);
  }
}
