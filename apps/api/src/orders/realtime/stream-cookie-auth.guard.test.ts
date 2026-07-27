import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { readStreamCookie } from './stream-cookie-auth.guard';

function req(cookie: string | undefined): Request {
  return { headers: cookie === undefined ? {} : { cookie } } as Request;
}

describe('readStreamCookie', () => {
  it('sem header cookie: null', () => {
    expect(readStreamCookie(req(undefined))).toBeNull();
  });

  it('extrai o __Host-molho_stream entre outros cookies', () => {
    expect(readStreamCookie(req('foo=1; __Host-molho_stream=abc.def.ghi; bar=2'))).toBe('abc.def.ghi');
  });

  it('cookie único', () => {
    expect(readStreamCookie(req('__Host-molho_stream=tok'))).toBe('tok');
  });

  it('valor com = (base64url padding não ocorre, mas não pode truncar no primeiro =)', () => {
    expect(readStreamCookie(req('__Host-molho_stream=a=b=c'))).toBe('a=b=c');
  });

  it('presente mas vazio: null (não string vazia)', () => {
    expect(readStreamCookie(req('__Host-molho_stream='))).toBeNull();
  });

  it('não confunde com um cookie de nome parecido', () => {
    expect(readStreamCookie(req('molho_stream=nope; x__Host-molho_stream=nope2'))).toBeNull();
  });
});
