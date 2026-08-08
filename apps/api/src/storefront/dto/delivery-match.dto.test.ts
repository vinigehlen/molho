import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { DeliveryMatchRequestDto } from './delivery-match.dto';

/**
 * Validação testada DIRETO via class-validator, não via HTTP/Nest — mesmo
 * motivo de product-image.dto.test.ts (esbuild do Vitest não emite
 * decorator metadata pro ValidationPipe descobrir a classe do DTO).
 */
async function validar(payload: unknown) {
  return validate(plainToInstance(DeliveryMatchRequestDto, payload));
}

describe('DeliveryMatchRequestDto', () => {
  it('aceita CEP com ou sem hífen; número é opcional', async () => {
    await expect(validar({ postalCode: '93600-000', number: '1684' })).resolves.toHaveLength(0);
    await expect(validar({ postalCode: '93600000', number: null })).resolves.toHaveLength(0);
  });

  it('rejeita CEP que não tem 8 dígitos', async () => {
    const errors = await validar({ postalCode: '9360', number: null });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty('matches');
  });

  it('rejeita CEP ausente — sem ele não há o que geocodar', async () => {
    const errors = await validar({ number: '1684' });
    expect(errors).toHaveLength(1);
  });

  it('descarta lat/lng: o cliente não fornece coordenada, o servidor deriva', async () => {
    // `whitelist: true` no ValidationPipe global (main.ts) tira do body toda
    // propriedade sem decorator — lat/lng mandados por um cliente antigo são
    // ignorados, não viram fonte de verdade nenhuma.
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const limpo = await pipe.transform(
      { postalCode: '93600-000', number: null, lat: -29.6, lng: -51.17 },
      { type: 'body', metatype: DeliveryMatchRequestDto },
    );

    expect(limpo).toEqual({ postalCode: '93600-000', number: null });
  });
});
