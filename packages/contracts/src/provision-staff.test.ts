import { describe, expect, it } from 'vitest';
import { provisionStaffSchema } from './provision-staff';

const VALID = {
  email: 'gerente@loja.com',
  role: 'owner' as const,
  scopeType: 'tenant' as const,
  scopeId: '018f3b1a-2b3c-7c4d-8e5f-6a7b8c9d0e1f',
};

describe('provisionStaffSchema', () => {
  it('aceita payload válido (role de lojista, escopo tenant)', () => {
    expect(provisionStaffSchema.safeParse(VALID).success).toBe(true);
  });

  it('aceita escopo store', () => {
    expect(provisionStaffSchema.safeParse({ ...VALID, role: 'cashier', scopeType: 'store' }).success).toBe(true);
  });

  it('rejeita role fora de ROLES', () => {
    expect(provisionStaffSchema.safeParse({ ...VALID, role: 'ceo' }).success).toBe(false);
  });

  it('rejeita scopeType "platform" (só tenant|store)', () => {
    expect(provisionStaffSchema.safeParse({ ...VALID, scopeType: 'platform' }).success).toBe(false);
  });

  it('rejeita platform.superadmin — super-admin só nasce do seed', () => {
    expect(provisionStaffSchema.safeParse({ ...VALID, role: 'platform.superadmin' }).success).toBe(false);
  });

  it('rejeita papéis internos platform_* (platform_owner etc.)', () => {
    expect(provisionStaffSchema.safeParse({ ...VALID, role: 'platform_owner' }).success).toBe(false);
  });

  it('rejeita scopeId que não é uuid', () => {
    expect(provisionStaffSchema.safeParse({ ...VALID, scopeId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejeita e-mail vazio', () => {
    expect(provisionStaffSchema.safeParse({ ...VALID, email: '' }).success).toBe(false);
  });
});
