import { describe, expect, it } from 'vitest';
import { MockStorageProvider } from './mock-storage.provider';

describe('MockStorageProvider', () => {
  it('1) gera key com prefixo products/{tenantId}/ e extensão certa por content-type', async () => {
    const provider = new MockStorageProvider();
    const result = await provider.createPresignedUpload({
      tenantId: 'tenant-1',
      contentType: 'image/png',
      contentLength: 1024,
    });

    expect(result.key).toMatch(/^products\/tenant-1\/[0-9a-f-]+\.png$/);
    expect(result.url).toContain(result.key);
  });

  it('2) mapeia jpeg/webp pra extensão correta', async () => {
    const provider = new MockStorageProvider();
    const jpeg = await provider.createPresignedUpload({ tenantId: 't', contentType: 'image/jpeg', contentLength: 1 });
    const webp = await provider.createPresignedUpload({ tenantId: 't', contentType: 'image/webp', contentLength: 1 });

    expect(jpeg.key).toMatch(/\.jpg$/);
    expect(webp.key).toMatch(/\.webp$/);
  });

  it('3) expiresAt ~5 minutos à frente, sem chamada de rede (não lança mesmo sem credencial nenhuma no ambiente)', async () => {
    const provider = new MockStorageProvider();
    const before = Date.now();
    const result = await provider.createPresignedUpload({
      tenantId: 'tenant-1',
      contentType: 'image/png',
      contentLength: 1,
    });

    const delta = result.expiresAt.getTime() - before;
    expect(delta).toBeGreaterThan(4 * 60 * 1000);
    expect(delta).toBeLessThan(6 * 60 * 1000);
  });

  it('4) duas chamadas geram keys diferentes (uuid aleatório, nunca reaproveita)', async () => {
    const provider = new MockStorageProvider();
    const a = await provider.createPresignedUpload({ tenantId: 't', contentType: 'image/png', contentLength: 1 });
    const b = await provider.createPresignedUpload({ tenantId: 't', contentType: 'image/png', contentLength: 1 });

    expect(a.key).not.toBe(b.key);
  });
});
