import { describe, expect, it } from 'vitest';
import {
  catalogProductOfferSchema,
  setCatalogProductOfferAvailabilitySchema,
  updateCatalogProductOfferSchema,
} from './catalog-admin';

const OFFER_ID = '018f47de-7e33-7c6a-8b2a-b65dc8a35e65';
const PRODUCT_ID = '018f47de-7e33-7c6a-8b2a-b65dc8a35e66';
const CATEGORY_ID = '018f47de-7e33-7c6a-8b2a-b65dc8a35e67';

describe('contratos de ProductOffer', () => {
  it('aceita uma oferta primária completa', () => {
    expect(
      catalogProductOfferSchema.parse({
        id: OFFER_ID,
        productId: PRODUCT_ID,
        categoryId: CATEGORY_ID,
        priceCents: 2590,
        available: true,
        pdvCode: 'PDV-42',
        sortOrder: 3,
        isPrimary: true,
        version: 0,
      }),
    ).toMatchObject({ priceCents: 2590, isPrimary: true });
  });

  it.each([-1, 25.5])('rejeita preço fora da regra de centavos: %s', (priceCents) => {
    const result = updateCatalogProductOfferSchema.safeParse({ version: 0, priceCents });
    expect(result.success).toBe(false);
  });

  it('não aceita available no PATCH genérico', () => {
    expect(
      updateCatalogProductOfferSchema.safeParse({ version: 0, available: false }).success,
    ).toBe(false);
    expect(
      setCatalogProductOfferAvailabilitySchema.parse({ version: 0, available: false }),
    ).toEqual({
      version: 0,
      available: false,
    });
  });
});
