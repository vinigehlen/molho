import type { DeliveryMatchResponse } from '@molho/contracts';
import type { DeliveryMatchRepository } from './delivery-match.repository';

/**
 * Só devolve o que o cliente precisa pra decidir se compra — nunca
 * `zoneId`/`storeId`/o polígono. Ver aviso de superfície de scraping em
 * `@molho/contracts/delivery-match.ts`.
 */
export class DeliveryMatchService {
  constructor(private readonly repository: DeliveryMatchRepository) {}

  async match(lat: number, lng: number): Promise<DeliveryMatchResponse> {
    const zone = await this.repository.findMatchingZone(lat, lng);
    if (!zone) return { withinZone: false };

    return {
      withinZone: true,
      zoneName: zone.name,
      feeCents: zone.feeCents,
      etaMinMinutes: zone.etaMinMinutes,
      etaMaxMinutes: zone.etaMaxMinutes,
    };
  }
}
