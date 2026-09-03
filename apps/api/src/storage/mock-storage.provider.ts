import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ALLOWED_IMAGE_CONTENT_TYPES, type PresignedUpload, type StorageProvider } from './storage-provider.port';

const PRESIGN_TTL_SECONDS = 300;

/** Dev sem credencial R2 — URL falsa, não sobe nada de verdade (mesmo espírito de MockMessagingProvider). */
export class MockStorageProvider implements StorageProvider {
  private readonly logger = new Logger('MockStorageProvider');

  async createPresignedUpload(params: {
    tenantId: string;
    folder?: 'products' | 'stores';
    contentType: keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;
    contentLength: number;
  }): Promise<PresignedUpload> {
    const extension = ALLOWED_IMAGE_CONTENT_TYPES[params.contentType];
    const key = `${params.folder ?? 'products'}/${params.tenantId}/${randomUUID()}.${extension}`;
    this.logger.log(
      `[mock] URL de upload gerada pra ${key} (${params.contentLength} bytes, nenhum arquivo sobe de verdade)`,
    );
    return {
      url: `http://mock-storage.local/${key}`,
      key,
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000),
    };
  }
}
