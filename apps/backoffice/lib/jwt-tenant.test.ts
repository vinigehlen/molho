import { describe, expect, it } from 'vitest';
import { subFromToken } from './jwt-tenant';

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
