import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestOtp, verifyOtp } from './customer-auth-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestOtp', () => {
  it('202: ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 202 })));
    expect(await requestOtp('hamburgueria-da-vila', '51999990000')).toEqual({ ok: true });
  });

  it('429: mensagem de rate limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 429 })));
    const resultado = await requestOtp('x', '51999990000');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.message).toMatch(/Muitos pedidos/);
  });

  it('erro de rede: mensagem genérica, nunca lança', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const resultado = await requestOtp('x', '51999990000');
    expect(resultado.ok).toBe(false);
  });

  it('outro status inesperado: mensagem genérica', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 400 })));
    const resultado = await requestOtp('x', '51999990000');
    expect(resultado.ok).toBe(false);
  });
});

describe('verifyOtp', () => {
  it('200 com payload esperado: devolve accessToken/customerId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ accessToken: 'token-x', refreshToken: 'refresh-x', user: { id: 'customer-1', name: null } }),
      })),
    );

    const resultado = await verifyOtp('hamburgueria-da-vila', '51999990000', '123456');
    expect(resultado).toEqual({ ok: true, accessToken: 'token-x', customerId: 'customer-1' });
  });

  it('400 (código errado): mensagem de código inválido', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const resultado = await verifyOtp('x', '51999990000', '000000');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.message).toMatch(/inválido/);
  });

  it('erro de rede: mensagem genérica, nunca lança', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect((await verifyOtp('x', '51999990000', '123456')).ok).toBe(false);
  });

  it('payload em formato inesperado: mensagem de resposta inesperada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ algumaCoisa: true }) })));
    const resultado = await verifyOtp('x', '51999990000', '123456');
    expect(resultado.ok).toBe(false);
  });
});
