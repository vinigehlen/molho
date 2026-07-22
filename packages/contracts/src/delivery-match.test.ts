import { describe, expect, it } from 'vitest';
import { deliveryMatchRequestSchema, deliveryMatchResponseSchema } from './delivery-match';

describe('deliveryMatchRequestSchema', () => {
  it('aceita lat/lng válidos', () => {
    expect(deliveryMatchRequestSchema.safeParse({ lat: -29.6, lng: -51.17 }).success).toBe(true);
  });

  it('rejeita lat/lng fora do intervalo geográfico válido', () => {
    expect(deliveryMatchRequestSchema.safeParse({ lat: 200, lng: -51.17 }).success).toBe(false);
    expect(deliveryMatchRequestSchema.safeParse({ lat: -29.6, lng: -500 }).success).toBe(false);
  });
});

describe('deliveryMatchResponseSchema', () => {
  it('dentro da zona: exige feeCents/eta inteiros não-negativos', () => {
    const dentro = {
      withinZone: true,
      zoneName: 'Zona padrão',
      feeCents: 800,
      etaMinMinutes: 30,
      etaMaxMinutes: 45,
    };
    expect(deliveryMatchResponseSchema.safeParse(dentro).success).toBe(true);
  });

  it('fora da zona: só o discriminante, sem taxa nem ETA', () => {
    expect(deliveryMatchResponseSchema.safeParse({ withinZone: false }).success).toBe(true);
  });

  it('rejeita feeCents fracionado — dinheiro é inteiro (CLAUDE.md regra 4)', () => {
    const invalido = { withinZone: true, zoneName: 'Zona padrão', feeCents: 8.5, etaMinMinutes: 30, etaMaxMinutes: 45 };
    expect(deliveryMatchResponseSchema.safeParse(invalido).success).toBe(false);
  });
});
