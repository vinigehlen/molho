import { deliveryMatchResponseSchema } from '@molho/contracts';
import { describe, expect, it } from 'vitest';
import type { DeliveryMatchRepository, DeliveryZoneMatch } from './delivery-match.repository';
import { DeliveryMatchService } from './delivery-match.service';

class FakeDeliveryMatchRepository implements DeliveryMatchRepository {
  zone: DeliveryZoneMatch | null = null;

  async findMatchingZone() {
    return this.zone;
  }
}

describe('DeliveryMatchService', () => {
  it('dentro da zona: devolve taxa e ETA, satisfazendo o contrato público', async () => {
    const repository = new FakeDeliveryMatchRepository();
    repository.zone = { name: 'Zona padrão', feeCents: 800, etaMinMinutes: 30, etaMaxMinutes: 45 };

    const result = await new DeliveryMatchService(repository).match(-29.6, -51.17);

    expect(result).toEqual({
      withinZone: true,
      zoneName: 'Zona padrão',
      feeCents: 800,
      etaMinMinutes: 30,
      etaMaxMinutes: 45,
    });
    expect(deliveryMatchResponseSchema.safeParse(result).success).toBe(true);
  });

  it('fora da zona: só o discriminante, nunca zoneId/storeId/polígono', async () => {
    const repository = new FakeDeliveryMatchRepository();
    repository.zone = null;

    const result = await new DeliveryMatchService(repository).match(0, 0);

    expect(result).toEqual({ withinZone: false });
    expect(deliveryMatchResponseSchema.safeParse(result).success).toBe(true);
  });
});
