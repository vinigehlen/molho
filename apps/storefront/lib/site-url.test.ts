import { describe, expect, it } from 'vitest';
import { normalizePublicUrl, storefrontPublicBaseUrl, storefrontPublicPath } from './site-url';

describe('URLs públicas da storefront', () => {
  it('usa a origem absoluta resolvida pelo host sem barra final', () => {
    expect(storefrontPublicBaseUrl('https://cabanhas-bbq.molho.live/', 'cabanhas-bbq')).toBe(
      'https://cabanhas-bbq.molho.live',
    );
  });

  it('preserva o modo por path apenas no fallback local', () => {
    const base = storefrontPublicBaseUrl(null, 'cabanhas-bbq', {});
    expect(base).toBe('http://localhost:3000/cabanhas-bbq');
    expect(storefrontPublicPath(base)).toBe('/cabanhas-bbq');
    expect(storefrontPublicPath('https://cabanhas-bbq.molho.live')).toBe('/');
  });

  it('rejeita URL ambígua e falha cedo em produção sem origem', () => {
    expect(normalizePublicUrl('https://molho.live@evil.test')).toBeNull();
    expect(normalizePublicUrl('javascript:alert(1)')).toBeNull();
    expect(() => storefrontPublicBaseUrl(null, 'cabanhas-bbq', { VERCEL_ENV: 'production' })).toThrow(
      /URL pública/,
    );
  });
});
