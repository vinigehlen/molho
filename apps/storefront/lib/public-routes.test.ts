import { describe, expect, it } from 'vitest';
import { storefrontRoute } from './public-routes';

describe('storefrontRoute', () => {
  it('mantém URLs limpas no modo por host', () => {
    expect(storefrontRoute('', '/carrinho')).toBe('/carrinho');
    expect(storefrontRoute('', '/acompanhar/token')).toBe('/acompanhar/token');
  });

  it('preserva o prefixo apenas no path mode local', () => {
    expect(storefrontRoute('/cabanhas-bbq', '/carrinho')).toBe('/cabanhas-bbq/carrinho');
    expect(storefrontRoute('/cabanhas-bbq')).toBe('/cabanhas-bbq');
  });
});
