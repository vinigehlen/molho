import { describe, expect, it } from 'vitest';
import { buildTenantMetadata } from '../../lib/tenant-metadata';

describe('metadata pública da loja por host', () => {
  it('não inclui slug como path em canonical, manifest ou OG', () => {
    const metadata = buildTenantMetadata(
      {
        name: 'Cabanhas BBQ',
        publicDescription: 'Churrasco no capricho.',
        addressText: null,
        logoImageUrl: 'https://assets.exampleusercontent.com/logo.png',
      },
      'https://cabanhas-bbq.molho.live',
    );

    expect(metadata.alternates).toEqual({ canonical: 'https://cabanhas-bbq.molho.live' });
    expect(metadata.manifest).toBe('https://cabanhas-bbq.molho.live/manifest.webmanifest');
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({
        url: 'https://cabanhas-bbq.molho.live',
        images: ['https://cabanhas-bbq.molho.live/opengraph-image'],
      }),
    );
  });
});
