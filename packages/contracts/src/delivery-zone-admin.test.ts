import { describe, expect, it } from 'vitest';
import { createDeliveryZoneSchema, deliveryZoneResponseSchema } from './delivery-zone-admin';

const validCityZone = {
  kind: 'city' as const,
  name: 'Centro',
  feeCents: 800,
  etaMinMinutes: 30,
  etaMaxMinutes: 45,
  priority: 0,
  city: 'Porto Alegre',
  state: 'RS',
};

const validPolygonZone = {
  kind: 'polygon' as const,
  name: 'Raio 3km',
  feeCents: 500,
  etaMinMinutes: 20,
  etaMaxMinutes: 35,
  priority: 1,
  polygon: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [-51.2, -30.03],
        [-51.19, -30.03],
        [-51.19, -30.02],
        [-51.2, -30.03],
      ],
    ],
  },
};

describe('createDeliveryZoneSchema', () => {
  it('aceita zona por cidade', () => {
    expect(createDeliveryZoneSchema.safeParse(validCityZone).success).toBe(true);
  });

  it('aceita zona por polígono', () => {
    expect(createDeliveryZoneSchema.safeParse(validPolygonZone).success).toBe(true);
  });

  it('rejeita cidade sem UF de 2 letras', () => {
    expect(createDeliveryZoneSchema.safeParse({ ...validCityZone, state: 'rs' }).success).toBe(false);
    expect(createDeliveryZoneSchema.safeParse({ ...validCityZone, state: 'RGS' }).success).toBe(false);
  });

  it('rejeita kind desconhecido — não é city nem polygon', () => {
    expect(createDeliveryZoneSchema.safeParse({ ...validCityZone, kind: 'raio' }).success).toBe(false);
  });

  it('rejeita etaMaxMinutes menor que etaMinMinutes', () => {
    expect(
      createDeliveryZoneSchema.safeParse({ ...validCityZone, etaMinMinutes: 40, etaMaxMinutes: 20 }).success,
    ).toBe(false);
  });

  it('rejeita feeCents fracionado — dinheiro é inteiro (CLAUDE.md regra 4)', () => {
    expect(createDeliveryZoneSchema.safeParse({ ...validCityZone, feeCents: 8.5 }).success).toBe(false);
  });

  it('rejeita anel de polígono com menos de 4 posições', () => {
    const invalido = {
      ...validPolygonZone,
      polygon: { type: 'Polygon', coordinates: [[[-51.2, -30.03], [-51.19, -30.03]]] },
    };
    expect(createDeliveryZoneSchema.safeParse(invalido).success).toBe(false);
  });
});

describe('deliveryZoneResponseSchema', () => {
  it('city/state nullable (zona por polígono não tem os dois)', () => {
    const resposta = {
      id: '018f9f3e-1234-7890-abcd-000000000000',
      name: 'Raio 3km',
      kind: 'polygon',
      city: null,
      state: null,
      feeCents: 500,
      etaMinMinutes: 20,
      etaMaxMinutes: 35,
      priority: 1,
    };
    expect(deliveryZoneResponseSchema.safeParse(resposta).success).toBe(true);
  });
});
