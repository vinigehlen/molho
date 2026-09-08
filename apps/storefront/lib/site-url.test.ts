import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadStorefrontUrl(): Promise<string> {
  vi.resetModules();
  return (await import('./site-url')).STOREFRONT_URL;
}

describe('STOREFRONT_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('usa NEXT_PUBLIC_STOREFRONT_URL quando definido, sem barra no fim', async () => {
    vi.stubEnv('NEXT_PUBLIC_STOREFRONT_URL', 'https://cabanhas-bbq.molho.live/');
    expect(await loadStorefrontUrl()).toBe('https://cabanhas-bbq.molho.live');
  });

  it('cai no domínio de dev quando a env não está setada', async () => {
    vi.stubEnv('NEXT_PUBLIC_STOREFRONT_URL', '');
    expect(await loadStorefrontUrl()).toBe('https://molho.vercel.app');
  });
});
