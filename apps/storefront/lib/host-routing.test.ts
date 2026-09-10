import { describe, expect, it } from 'vitest';
import {
  isValidStorefrontSlug,
  parseAuthority,
  publicBaseUrl,
  resolveTenant,
  storefrontRoutingConfig,
  type StorefrontRoutingConfig,
} from './host-routing';

const CONFIG: StorefrontRoutingConfig = {
  rootDomain: 'molho.live',
  pathMode: false,
  technicalHost: 'molho-storefront-prod-a1b2.vercel.app',
  technicalSlug: 'cabanhas-bbq',
};

describe('host routing da storefront', () => {
  it('normaliza hostname e remove porta', () => {
    expect(parseAuthority('Cabanhas-BBQ.Molho.Live:443')).toEqual({
      hostname: 'cabanhas-bbq.molho.live',
      port: '443',
    });
  });

  it.each([
    'cabanhas-bbq.molho.live.evil.test',
    'evil.test@cabanhas-bbq.molho.live',
    'cabanhas-bbq.molho.live/path',
    'cabanhas_bbbq.molho.live',
    'cabanhas-bbq.molho.live:99999',
    'cabanhas-bbq.molho.live,evil.test',
  ])('rejeita host malicioso ou inválido: %s', (host) => {
    expect(resolveTenant(host, '/', CONFIG)).toBeNull();
  });

  it.each(['www', 'app', 'api', 'staging', 'staging-app'])('reserva %s.molho.live', (slug) => {
    expect(isValidStorefrontSlug(slug)).toBe(false);
    expect(resolveTenant(`${slug}.molho.live`, '/', CONFIG)).toBeNull();
  });

  it('resolve tenant por subdomínio sem expor slug no caminho', () => {
    const resolution = resolveTenant('cabanhas-bbq.molho.live', '/acompanhar/token', CONFIG);
    expect(resolution).toEqual({ slug: 'cabanhas-bbq', mode: 'host' });
    expect(publicBaseUrl('https:', 'cabanhas-bbq.molho.live', resolution!)).toBe(
      'https://cabanhas-bbq.molho.live',
    );
  });

  it('liga a URL técnica somente ao slug explícito do deployment', () => {
    expect(resolveTenant('molho-storefront-prod-a1b2.vercel.app', '/', CONFIG)).toEqual({
      slug: 'cabanhas-bbq',
      mode: 'technical',
    });
    expect(resolveTenant('outro-preview.vercel.app', '/', CONFIG)).toBeNull();
  });

  it('mantém modo por path somente quando habilitado', () => {
    expect(resolveTenant('localhost:3000', '/cabanhas-bbq/carrinho', { ...CONFIG, pathMode: true })).toEqual({
      slug: 'cabanhas-bbq',
      mode: 'path',
    });
    expect(resolveTenant('localhost:3000', '/cabanhas-bbq/carrinho', CONFIG)).toBeNull();
  });

  it('falha cedo em deployment produtivo sem domínio, slug técnico ou com path mode', () => {
    expect(() => storefrontRoutingConfig({ VERCEL_ENV: 'production' })).toThrow(/ROOT_DOMAIN/);
    expect(() =>
      storefrontRoutingConfig({
        VERCEL_ENV: 'production',
        MOLHO_STOREFRONT_ROOT_DOMAIN: 'molho.live',
      }),
    ).toThrow(/TECHNICAL_SLUG/);
    expect(() =>
      storefrontRoutingConfig({
        VERCEL_ENV: 'production',
        MOLHO_STOREFRONT_ROOT_DOMAIN: 'molho.live',
        MOLHO_STOREFRONT_TECHNICAL_SLUG: 'cabanhas-bbq',
        MOLHO_STOREFRONT_PATH_MODE: 'true',
      }),
    ).toThrow(/PATH_MODE/);
  });
});
