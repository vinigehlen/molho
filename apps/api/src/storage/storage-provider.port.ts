/** image/jpeg, image/png, image/webp — únicos aceitos pra foto de produto. */
export const ALLOWED_IMAGE_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AllowedImageContentType = keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;

export function isAllowedImageContentType(value: string): value is AllowedImageContentType {
  return value in ALLOWED_IMAGE_CONTENT_TYPES;
}

export interface PresignedUpload {
  url: string;
  key: string;
  expiresAt: Date;
}

/**
 * Porta pro storage de objetos (R2/S3-compatible) — CLAUDE.md regra 8,
 * adapters plugáveis pra todo serviço externo. Só write (presigned PUT); a
 * URL pública de LEITURA fica pro épico que renderiza a foto (storefront,
 * Épico 5) — S3_PUBLIC_URL ainda não está configurada no ambiente.
 */
export interface StorageProvider {
  createPresignedUpload(params: {
    tenantId: string;
    contentType: AllowedImageContentType;
    /** Assinado como Content-Length exato no PUT — o cliente não consegue mandar corpo maior (R2 rejeita o mismatch). */
    contentLength: number;
  }): Promise<PresignedUpload>;
}
