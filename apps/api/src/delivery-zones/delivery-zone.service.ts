import type { CreateDeliveryZoneInput, DeliveryZoneResponse, UpdateDeliveryZoneInput } from '@molho/contracts';
import { DeliveryZoneValidationError } from './delivery-zone.errors';
import type { DeliveryZoneRepository } from './delivery-zone.repository';

export type DeliveryZoneInput = CreateDeliveryZoneInput | UpdateDeliveryZoneInput;

export class DeliveryZoneAdminService {
  constructor(private readonly repo: DeliveryZoneRepository) {}

  list(storeId: string): Promise<DeliveryZoneResponse[]> {
    return this.repo.listByStore(storeId);
  }

  create(storeId: string, input: CreateDeliveryZoneInput): Promise<DeliveryZoneResponse> {
    this.assertInvariants(input);
    return this.repo.create(storeId, input);
  }

  update(zoneId: string, expectedVersion: number, input: UpdateDeliveryZoneInput): Promise<DeliveryZoneResponse> {
    this.assertInvariants(input);
    return this.repo.update(zoneId, expectedVersion, input);
  }

  delete(zoneId: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(zoneId, expectedVersion);
  }

  private assertInvariants(input: DeliveryZoneInput): void {
    if (input.name.trim().length === 0) throw new DeliveryZoneValidationError('Nome não pode ser vazio.');
    if (input.feeCents < 0) throw new DeliveryZoneValidationError('Taxa de entrega não pode ser negativa.');
    if (input.priority < 0) throw new DeliveryZoneValidationError('Prioridade não pode ser negativa.');
    if (input.etaMaxMinutes < input.etaMinMinutes) {
      throw new DeliveryZoneValidationError('ETA máximo precisa ser maior ou igual ao mínimo.');
    }

    if (input.kind === 'city') {
      if (input.city.trim().length === 0) throw new DeliveryZoneValidationError('Cidade não pode ser vazia.');
      if (!/^[A-Z]{2}$/.test(input.state.trim().toUpperCase())) {
        throw new DeliveryZoneValidationError('UF precisa ter 2 letras maiúsculas.');
      }
    }
  }
}
