import { describe, expect, it } from 'vitest';
import { isPlatformSuperadmin, subFromToken } from './jwt-tenant';

/** Monta um JWT falso (header.payload.sig) com o payload dado — só o meio importa. */
function jwt(payload: unknown): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `h.${b64}.s`;
}

describe('subFromToken', () => {
  it('token malformado: null, não lança', () => {
    expect(subFromToken('nao-e-jwt')).toBeNull();
    expect(subFromToken('')).toBeNull();
  });

  it('extrai o userId do access token', () => {
    expect(subFromToken(jwt({ sub: 'u1' }))).toBe('u1');
  });

  it('payload sem sub: null', () => {
    expect(subFromToken(jwt({ roles: ['owner'] }))).toBeNull();
  });
});

describe('isPlatformSuperadmin', () => {
  it('true quando o papel platform.superadmin está nos roles', () => {
    expect(isPlatformSuperadmin(jwt({ roles: ['platform.superadmin'] }))).toBe(true);
  });

  it('false pra staff comum de tenant', () => {
    expect(isPlatformSuperadmin(jwt({ roles: ['owner', 'manager'] }))).toBe(false);
  });

  it('token malformado ou sem roles: false, não lança', () => {
    expect(isPlatformSuperadmin('nao-e-jwt')).toBe(false);
    expect(isPlatformSuperadmin(jwt({ sub: 'u1' }))).toBe(false);
  });
});
