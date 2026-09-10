import { describe, expect, it } from 'vitest';
import { internalApiOrigin } from './api-origin';

describe('origem server-only da API', () => {
  it('usa localhost somente fora do deployment produtivo', () => {
    expect(internalApiOrigin({})).toBe('http://localhost:3333');
  });

  it('aceita a URL técnica HTTPS no release candidate', () => {
    expect(
      internalApiOrigin({ VERCEL_ENV: 'production', MOLHO_API_INTERNAL_URL: 'https://molho-api.fly.dev' }),
    ).toBe('https://molho-api.fly.dev');
  });

  it.each(['', 'http://api.molho.live', 'https://api.staging.molho.live'])('rejeita origem produtiva insegura: %s', (url) => {
    expect(() => internalApiOrigin({ VERCEL_ENV: 'production', MOLHO_API_INTERNAL_URL: url })).toThrow();
  });
});
