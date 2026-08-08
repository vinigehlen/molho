import { describe, expect, it } from 'vitest';
import { deliveryMatchRequestSchema, deliveryMatchResponseSchema } from './delivery-match';

describe('deliveryMatchRequestSchema', () => {
  it('aceita CEP com ou sem hífen', () => {
    expect(deliveryMatchRequestSchema.safeParse({ postalCode: '93600-000', number: '1684' }).success).toBe(true);
    expect(deliveryMatchRequestSchema.safeParse({ postalCode: '93600000', number: null }).success).toBe(true);
  });

  it('rejeita CEP que não tem 8 dígitos', () => {
    expect(deliveryMatchRequestSchema.safeParse({ postalCode: '9360', number: null }).success).toBe(false);
    expect(deliveryMatchRequestSchema.safeParse({ postalCode: '936000000', number: null }).success).toBe(false);
  });

  it('NÃO aceita lat/lng do cliente — o servidor é quem deriva o ponto', () => {
    expect(deliveryMatchRequestSchema.safeParse({ lat: -29.6, lng: -51.17 }).success).toBe(false);
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
