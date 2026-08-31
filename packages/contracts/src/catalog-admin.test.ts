import { describe, expect, it } from 'vitest';
import {
  catalogModifierSchema,
  catalogProductOfferSchema,
  copyCatalogModifierGroupForProductSchema,
  createCatalogModifierSchema,
  createCatalogProductOfferSchema,
  createCatalogProductSchema,
  updateCatalogProductSchema,
  reorderCatalogModifiersSchema,
  setCatalogProductOfferAvailabilitySchema,
  updateCatalogModifierSchema,
  updateCatalogProductOfferSchema,
} from './catalog-admin';

const OFFER_ID = '018f47de-7e33-7c6a-8b2a-b65dc8a35e65';
const PRODUCT_ID = '018f47de-7e33-7c6a-8b2a-b65dc8a35e66';
const CATEGORY_ID = '018f47de-7e33-7c6a-8b2a-b65dc8a35e67';
const GROUP_ID = '018f47de-7e33-7c6a-8b2a-b65dc8a35e68';

describe('contrato de Product.kind (combo fase 3)', () => {
  const base = { categoryId: CATEGORY_ID, name: 'Coca lata', basePriceCents: 700 };

  it('não exige kind na criação', () => {
    expect(createCatalogProductSchema.parse(base).kind).toBeUndefined();
  });

  it('aceita os três valores válidos', () => {
    for (const kind of ['prepared', 'industrialized', 'combo'] as const) {
      expect(createCatalogProductSchema.parse({ ...base, kind }).kind).toBe(kind);
    }
  });

  it('rejeita kind fora do enum', () => {
    expect(createCatalogProductSchema.safeParse({ ...base, kind: 'bebida' }).success).toBe(false);
    expect(updateCatalogProductSchema.safeParse({ version: 0, kind: 'bebida' }).success).toBe(false);
  });
});

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

  it('aceita a criação de uma apresentação secundária sem expor isPrimary', () => {
    expect(
      createCatalogProductOfferSchema.parse({
        productId: PRODUCT_ID,
        categoryId: CATEGORY_ID,
        priceCents: 2390,
        available: true,
      }),
    ).toEqual({
      productId: PRODUCT_ID,
      categoryId: CATEGORY_ID,
      priceCents: 2390,
      available: true,
    });
    expect(
      createCatalogProductOfferSchema.safeParse({
        productId: PRODUCT_ID,
        categoryId: CATEGORY_ID,
        priceCents: 2390,
        isPrimary: true,
      }).success,
    ).toBe(false);
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

describe('contratos da biblioteca de complementos', () => {
  it('aceita opção completa com conteúdo, disponibilidade, PDV e ordem', () => {
    expect(
      catalogModifierSchema.parse({
        id: OFFER_ID,
        groupId: GROUP_ID,
        name: 'Bacon crocante',
        description: 'Duas fatias.',
        imageKey: 'products/tenant/bacon.webp',
        imageUrl: 'https://cdn.example.com/bacon.webp',
        priceDeltaCents: 500,
        active: true,
        pdvCode: 'BAC-01',
        sortOrder: 2,
        version: 0,
      }),
    ).toMatchObject({ active: true, sortOrder: 2 });
  });

  it('mantém os campos avançados opcionais na criação e rejeita preço negativo', () => {
    expect(
      createCatalogModifierSchema.parse({ groupId: GROUP_ID, name: 'Sem cebola', priceDeltaCents: 0 }),
    ).toEqual({ groupId: GROUP_ID, name: 'Sem cebola', priceDeltaCents: 0 });
    expect(
      updateCatalogModifierSchema.safeParse({ version: 0, priceDeltaCents: -1 }).success,
    ).toBe(false);
  });

  it('exige o produto ao separar uma cópia de grupo reutilizado', () => {
    expect(copyCatalogModifierGroupForProductSchema.parse({ productId: PRODUCT_ID })).toEqual({
      productId: PRODUCT_ID,
    });
    expect(copyCatalogModifierGroupForProductSchema.safeParse({}).success).toBe(false);
  });

  it('exige grupo e versões otimistas ao reordenar opções', () => {
    expect(
      reorderCatalogModifiersSchema.parse({
        groupId: GROUP_ID,
        items: [{ id: OFFER_ID, version: 3 }],
      }),
    ).toEqual({ groupId: GROUP_ID, items: [{ id: OFFER_ID, version: 3 }] });
    expect(reorderCatalogModifiersSchema.safeParse({ groupId: GROUP_ID, items: [] }).success).toBe(false);
  });
});
