import { describe, expect, it } from 'vitest';
import { internalApiOrigin } from './api-origin';

describe('origem server-only da API', () => {
  it('usa localhost somente fora do deployment produtivo', () => {
    expect(internalApiOrigin({})).toBe('http://localhost:3333');
  });

  it('aceita a URL técnica HTTPS no release candidate', () => {
    expect(
      internalApiOrigin({
        VERCEL_ENV: 'production',
        MOLHO_ENV: 'production',
        MOLHO_API_INTERNAL_URL: 'https://molho-api.fly.dev',
      }),
    ).toBe('https://molho-api.fly.dev');
  });

  it.each(['', 'http://api.molho.live', 'https://api.staging.molho.live'])('rejeita origem produtiva insegura: %s', (url) => {
    expect(() =>
      internalApiOrigin({ VERCEL_ENV: 'production', MOLHO_ENV: 'production', MOLHO_API_INTERNAL_URL: url }),
    ).toThrow();
  });

  it('aceita somente a API de staging no projeto de staging', () => {
    expect(
      internalApiOrigin({
        VERCEL_ENV: 'production',
        MOLHO_ENV: 'staging',
        MOLHO_API_INTERNAL_URL: 'https://api.staging.molho.live',
      }),
    ).toBe('https://api.staging.molho.live');
    expect(() =>
      internalApiOrigin({
        VERCEL_ENV: 'production',
        MOLHO_ENV: 'staging',
        MOLHO_API_INTERNAL_URL: 'https://api.molho.live',
      }),
    ).toThrow(/API de staging/);
  });

  it('exige o ambiente de negócio em deployment publicado', () => {
    expect(() =>
      internalApiOrigin({ VERCEL_ENV: 'production', MOLHO_API_INTERNAL_URL: 'https://api.molho.live' }),
    ).toThrow(/MOLHO_ENV/);
  });
});
