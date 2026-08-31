import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CreateProductOfferDto,
  SetProductOfferAvailabilityDto,
  UpdateProductOfferDto,
} from './product-offer.dto';

/** Validação direta: o transform do Vitest não emite a metadata que o
 * ValidationPipe usa em testes HTTP simulados. O servidor compilado pelo tsc
 * emite; ver docs/07-aprendizados.md e product-image.dto.test.ts. */
describe('DTOs de ProductOffer', () => {
  it('aceita criação secundária com preço inteiro', async () => {
    const dto = plainToInstance(CreateProductOfferDto, {
      productId: '018f47de-7e33-7c6a-8b2a-b65dc8a35e66',
      categoryId: '018f47de-7e33-7c6a-8b2a-b65dc8a35e67',
      priceCents: 2590,
      available: true,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita edição válida de preço/categoria/PDV/ordem', async () => {
    const dto = plainToInstance(UpdateProductOfferDto, {
      version: 0,
      categoryId: '018f47de-7e33-7c6a-8b2a-b65dc8a35e67',
      priceCents: 2790,
      pdvCode: 'PDV-42',
      sortOrder: 2,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([-1, 12.5])('rejeita preço inválido: %s', async (priceCents) => {
    const dto = plainToInstance(UpdateProductOfferDto, { version: 0, priceCents });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'priceCents')).toBe(true);
  });

  it('rejeita versão negativa no toggle de disponibilidade', async () => {
    const dto = plainToInstance(SetProductOfferAvailabilityDto, { version: -1, available: false });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'version')).toBe(true);
  });
});
