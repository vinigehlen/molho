import type { ThemeKey, UpdateStoreSetupInput } from '@molho/contracts';
import type { ResolvedAddress } from '../geo/resolve-address';
import type { StoreSetupRepository } from './store-setup.repository';
import { StoreSetupValidationError } from './store-setup.errors';

export class StoreSetupService {
  constructor(private readonly repo: StoreSetupRepository) {}

  get(storeId: string, actorId?: string) {
    return this.repo.get(storeId, actorId);
  }

  async update(
    storeId: string,
    input: UpdateStoreSetupInput,
    actor?: { userId: string; role: string },
    resolvedAddress?: ResolvedAddress | null,
  ) {
    if (input.pixKey && (!input.pixKeyType || !input.pixMerchantCity)) {
      throw new StoreSetupValidationError('Para vender por PIX, informe tipo da chave e cidade do recebedor.');
    }
    return this.repo.update(storeId, input, actor, resolvedAddress);
  }

  updateTheme(storeId: string, themeKey: ThemeKey) {
    return this.repo.updateTheme(storeId, themeKey);
  }

  publish(storeId: string, actorId: string) {
    return this.repo.publish(storeId, actorId);
  }
}
