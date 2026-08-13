import type { PutStoreHoursInput, StoreHoursResponse } from '@molho/contracts';
import { StoreHoursValidationError } from './store-hours-admin.errors';
import type { StoreHoursAdminRepository } from './store-hours-admin.repository';

export class StoreHoursAdminService {
  constructor(private readonly repo: StoreHoursAdminRepository) {}

  list(storeId: string): Promise<StoreHoursResponse> {
    return this.repo.list(storeId);
  }

  replaceAll(storeId: string, input: PutStoreHoursInput): Promise<StoreHoursResponse> {
    this.assertInvariants(input);
    return this.repo.replaceAll(storeId, input);
  }

  private assertInvariants(input: PutStoreHoursInput): void {
    for (const shift of input.shifts) {
      if (shift.opensAtMinutes === shift.closesAtMinutes) {
        throw new StoreHoursValidationError('Turno precisa ter abertura e fechamento diferentes.');
      }
    }
  }
}
