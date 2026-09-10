import { describe, expect, it } from 'vitest';
import { storefrontDisplayUrl, storefrontUrl } from './storefront-url';

describe('URL pública da loja', () => {
  it('usa o slug como subdomínio, nunca como path', () => {
    expect(storefrontUrl('cabanhas-bbq')).toBe('https://cabanhas-bbq.molho.live');
    expect(storefrontDisplayUrl('cabanhas-bbq')).toBe('cabanhas-bbq.molho.live');
  });
});
