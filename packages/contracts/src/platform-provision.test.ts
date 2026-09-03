import { describe, expect, it } from 'vitest';
import { provisionTenantSchema } from './platform-provision';

const VALID = {
  name: 'Pizzaria Nova',
  plan: 'standard' as const,
  ownerEmail: 'dono@pizzarianova.com',
  ownerName: 'Fulano da Silva',
};

describe('provisionTenantSchema', () => {
  it('aceita payload válido', () => {
    expect(provisionTenantSchema.safeParse(VALID).success).toBe(true);
  });

  it('default immediate=false quando ausente', () => {
    const parsed = provisionTenantSchema.parse(VALID);
    expect(parsed.immediate).toBe(false);
  });

  it('aceita immediate=true', () => {
    expect(provisionTenantSchema.safeParse({ ...VALID, immediate: true }).success).toBe(true);
  });

  it('rejeita plan fora de PLANS', () => {
    expect(provisionTenantSchema.safeParse({ ...VALID, plan: 'enterprise' }).success).toBe(false);
  });

  it('rejeita name muito curto', () => {
    expect(provisionTenantSchema.safeParse({ ...VALID, name: 'A' }).success).toBe(false);
  });

  it('rejeita ownerEmail vazio', () => {
    expect(provisionTenantSchema.safeParse({ ...VALID, ownerEmail: '' }).success).toBe(false);
  });

  it('rejeita ownerName vazio', () => {
    expect(provisionTenantSchema.safeParse({ ...VALID, ownerName: '' }).success).toBe(false);
  });
});
