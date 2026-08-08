import type { DeliveryMatchResponse } from '@molho/contracts';
import type { ResolvedAddress } from '../geo/resolve-address';
import type { DeliveryMatchRepository } from './delivery-match.repository';

/**
 * Só devolve o que o cliente precisa pra decidir se compra — nunca
 * `zoneId`/`storeId`/o polígono. Ver aviso de superfície de scraping em
 * `@molho/contracts/delivery-match.ts`.
 */
export class DeliveryMatchService {
  constructor(private readonly repository: DeliveryMatchRepository) {}

  /**
   * `resolved` vem do middleware de geocode (CEP → cidade + ponto), nunca do
   * payload: o cliente não fornece coordenada nem cidade autoritativa. A
   * CIDADE é o que decide a taxa; o ponto só serve pra zona por raio.
   */
  async match(resolved: ResolvedAddress): Promise<DeliveryMatchResponse> {
    const zone = await this.repository.findMatchingZone({
      city: resolved.city,
      state: resolved.state,
      lat: resolved.lat,
      lng: resolved.lng,
    });
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
