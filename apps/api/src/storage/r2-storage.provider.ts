import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ALLOWED_IMAGE_CONTENT_TYPES, type PresignedUpload, type StorageProvider } from './storage-provider.port';

const PRESIGN_TTL_SECONDS = 300;

export interface R2StorageProviderDeps {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * R2 é S3-compatible (docs/01-plano-produto.md §5) — @aws-sdk/client-s3
 * funciona direto trocando `endpoint`. `forcePathStyle` é o que o R2 exige
 * (vhost-style de bucket não funciona no endpoint dele).
 */
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(deps: R2StorageProviderDeps) {
    this.bucket = deps.bucket;
    this.client = new S3Client({
      endpoint: deps.endpoint,
      region: deps.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: deps.accessKeyId,
        secretAccessKey: deps.secretAccessKey,
      },
    });
  }

  async createPresignedUpload(params: {
    tenantId: string;
    contentType: keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;
    contentLength: number;
  }): Promise<PresignedUpload> {
    const extension = ALLOWED_IMAGE_CONTENT_TYPES[params.contentType];
    // Chave sempre gerada no servidor — nunca a partir de nome de arquivo do
    // cliente (evita path traversal/colisão). Prefixo por tenant, mesmo
    // padrão do MisterCheff analisado (§3.2 do plano-produto).
    const key = `products/${params.tenantId}/${randomUUID()}.${extension}`;

    // ContentType e ContentLength precisam bater EXATAMENTE com o que o
    // cliente manda no PUT real, senão o R2 rejeita com 403 (content-length
    // assinado impede corpo maior; content-type assinado impede subir um
    // binário qualquer disfarçado de imagem). content-length já vem assinado
    // por padrão — content-type NÃO: `S3RequestPresigner.prepareRequest()`
    // (dentro do próprio @aws-sdk/s3-request-presigner) faz
    // `unsignableHeaders.add("content-type")` incondicional, então
    // `unhoistableHeaders` sozinho não é suficiente — só `signableHeaders`
    // tem prioridade sobre isso (documentado no smithy/types: "overrides
    // those provided via unsignableHeaders"). Achado testando com um PUT
    // real de content-type divergente contra R2 de verdade: sem
    // `signableHeaders` aqui, o mismatch passava batido com 200.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_TTL_SECONDS,
      signableHeaders: new Set(['content-type']),
    });

    return { url, key, expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000) };
  }
}
