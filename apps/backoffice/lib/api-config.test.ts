import { describe, expect, it } from 'vitest';
import { validateApiUrl } from './api-config';

describe('validação da URL da API do backoffice', () => {
  it('não valida fora do deployment produtivo', () => {
    expect(() => validateApiUrl({})).not.toThrow();
    expect(() => validateApiUrl({ NEXT_PUBLIC_API_URL: 'http://localhost:3333' })).not.toThrow();
  });

  it('exige MOLHO_ENV em deployment publicado', () => {
    expect(() =>
      validateApiUrl({ VERCEL_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://api.molho.live' }),
    ).toThrow(/MOLHO_ENV/);
  });

  it('aceita a API de produção no projeto de produção', () => {
    expect(() =>
      validateApiUrl({
        VERCEL_ENV: 'production',
        MOLHO_ENV: 'production',
        NEXT_PUBLIC_API_URL: 'https://api.molho.live',
      }),
    ).not.toThrow();
  });

  it('rejeita produção apontando pra staging', () => {
    expect(() =>
      validateApiUrl({
        VERCEL_ENV: 'production',
        MOLHO_ENV: 'production',
        NEXT_PUBLIC_API_URL: 'https://api.staging.molho.live',
      }),
    ).toThrow(/production exige/);
  });

  it('aceita a API de staging no projeto de staging', () => {
    expect(() =>
      validateApiUrl({
        VERCEL_ENV: 'production',
        MOLHO_ENV: 'staging',
        NEXT_PUBLIC_API_URL: 'https://api.staging.molho.live',
      }),
    ).not.toThrow();
  });

  it('rejeita staging apontando pra produção', () => {
    expect(() =>
      validateApiUrl({
        VERCEL_ENV: 'production',
        MOLHO_ENV: 'staging',
        NEXT_PUBLIC_API_URL: 'https://api.molho.live',
      }),
    ).toThrow(/staging exige/);
  });
});
