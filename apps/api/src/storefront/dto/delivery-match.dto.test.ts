import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { DeliveryMatchRequestDto } from './delivery-match.dto';

/**
 * Validação testada DIRETO via class-validator, não via HTTP/Nest — mesmo
 * motivo de product-image.dto.test.ts (esbuild do Vitest não emite
 * decorator metadata pro ValidationPipe descobrir a classe do DTO).
 */
describe('DeliveryMatchRequestDto', () => {
  it('aceita lat/lng válidos', async () => {
    const dto = plainToInstance(DeliveryMatchRequestDto, { lat: -29.6, lng: -51.17 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita lat fora do intervalo -90..90', async () => {
    const dto = plainToInstance(DeliveryMatchRequestDto, { lat: 200, lng: -51.17 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty('max');
  });

  it('rejeita lng fora do intervalo -180..180', async () => {
    const dto = plainToInstance(DeliveryMatchRequestDto, { lat: -29.6, lng: -500 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty('min');
  });

  it('rejeita lat/lng ausentes', async () => {
    const dto = plainToInstance(DeliveryMatchRequestDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
