import { describe, expect, it } from 'vitest';
import { firstTenantScopeId } from './jwt-tenant';

/** Monta um JWT falso (header.payload.sig) com o payload dado — só o meio importa. */
function jwt(payload: unknown): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `h.${b64}.s`;
}

describe('firstTenantScopeId', () => {
  it('pega o scopeId do primeiro scope de tenant', () => {
    const token = jwt({
      scopes: [
        { scopeType: 'platform', scopeId: null },
        { scopeType: 'tenant', scopeId: 'tenant-abc' },
      ],
    });
    expect(firstTenantScopeId(token)).toBe('tenant-abc');
  });

  it('sem scope de tenant: null', () => {
    expect(firstTenantScopeId(jwt({ scopes: [{ scopeType: 'platform', scopeId: null }] }))).toBeNull();
  });

  it('token malformado: null, não lança', () => {
    expect(firstTenantScopeId('nao-e-jwt')).toBeNull();
    expect(firstTenantScopeId('')).toBeNull();
  });

  it('payload sem scopes: null', () => {
    expect(firstTenantScopeId(jwt({ sub: 'u1' }))).toBeNull();
  });
});
