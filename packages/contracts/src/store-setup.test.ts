import { describe, expect, it } from 'vitest';
import { storeBrandUploadUrlSchema, storeSetupSchema, updateStoreSetupSchema } from './store-setup';

const UUID = '018f3c2a-0000-7000-8000-000000000001';

const SETUP = {
  id: UUID,
  tenantId: UUID,
  tenantSlug: 'casa-molho',
  cnpj: '12345678000190',
  ownerName: 'Dona Molho',
  name: 'Casa Molho',
  legalName: 'Casa Molho Ltda',
  stateRegistration: 'ISENTO',
  publicDescription: 'Comida brasileira no capricho.',
  addressText: 'Rua das Panelas, 10',
  postalCode: '93610000',
  street: 'Rua das Panelas',
  number: '10',
  neighborhood: 'Centro',
  city: 'Estância Velha',
  state: 'RS',
  complement: null,
  referencePoint: null,
  phone: '51999990000',
  whatsappNumber: '51999990000',
  logoImageKey: 'stores/t/logo.png',
  logoImageUrl: 'https://cdn.molho.test/stores/t/logo.png',
  coverImageKey: 'stores/t/cover.png',
  coverImageUrl: 'https://cdn.molho.test/stores/t/cover.png',
  responsibleCpf: '00000000000',
  responsiblePhone: '+5551999990000',
  financeEmail: 'financeiro@casa.test',
  minOrderCents: 2500,
  pixKey: 'pix@casa.test',
  pixKeyType: 'email',
  pixMerchantCity: 'SAO PAULO',
  timezone: 'America/Sao_Paulo',
  themeKey: 'brasa',
  onboardedAt: null,
} as const;

describe('store setup P0', () => {
  it('aceita os campos estruturados de loja, marca e responsável', () => {
    expect(storeSetupSchema.safeParse(SETUP).success).toBe(true);
    expect(updateStoreSetupSchema.safeParse({
      ...SETUP,
      logoImageUrl: undefined,
      coverImageUrl: undefined,
      id: undefined,
      tenantId: undefined,
      tenantSlug: undefined,
      timezone: undefined,
    }).success).toBe(false);
    const { id: _id, tenantId: _tenantId, tenantSlug: _tenantSlug, timezone: _timezone, logoImageUrl: _logoUrl, coverImageUrl: _coverUrl, themeKey: _themeKey, onboardedAt: _onboardedAt, ...update } = SETUP;
    expect(updateStoreSetupSchema.safeParse(update).success).toBe(true);
  });

  it('rejeita PII financeira em formato inválido', () => {
    const { id: _id, tenantId: _tenantId, tenantSlug: _tenantSlug, timezone: _timezone, logoImageUrl: _logoUrl, coverImageUrl: _coverUrl, themeKey: _themeKey, onboardedAt: _onboardedAt, ...update } = SETUP;
    expect(updateStoreSetupSchema.safeParse({ ...update, responsiblePhone: '123' }).success).toBe(false);
    expect(updateStoreSetupSchema.safeParse({ ...update, financeEmail: 'sem-arroba' }).success).toBe(false);
  });

  it('valida upload de logo/capa por URL assinada', () => {
    expect(storeBrandUploadUrlSchema.safeParse({ kind: 'logo', contentType: 'image/png', contentLength: 1024 }).success).toBe(true);
    expect(storeBrandUploadUrlSchema.safeParse({ kind: 'cover', contentType: 'application/pdf', contentLength: 1024 }).success).toBe(false);
  });
});
