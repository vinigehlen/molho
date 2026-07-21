/**
 * Fotos reais de produto pro seed do catálogo (Épico 4, débito fechado: o
 * commit anterior deixou `imageKey: null` de propósito por falta de
 * `PEXELS_API_KEY`). Busca na Pexels API, recorta em quadrado e sobe no R2.
 *
 * Roda como script solto (`tsx`), não como parte de `apps/api` — por isso o
 * upload aqui NÃO reusa `apps/api/src/storage/r2-storage.provider.ts`: um
 * pacote (`packages/db`) importar código de dentro de um app
 * (`apps/api/src`) inverteria a direção da dependência do monorepo (apps
 * dependem de packages, nunca o contrário). O cliente S3 abaixo é
 * construído com a mesma lib (`@aws-sdk/client-s3`) e o mesmo formato de
 * chave (`products/{tenantId}/{uuid}.jpg`) só que self-contained.
 *
 * Nunca lança: qualquer falha (Pexels fora do ar, sem resultado, download,
 * sharp, upload) vira warning no console e `null` — o produto fica com
 * `imageKey: null`, que `resolvePublicImageUrl` já degrada pro placeholder
 * do tema. O seed não pode travar por causa de foto.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';
/** Card do produto é quadrado no storefront (MoProductCard) — crop já nasce no formato certo. */
const PHOTO_SIZE = 800;
const CREDITS_FILE = join(__dirname, 'photo-credits.json');

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: { original: string; large2x: string; large: string };
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
}

export interface PhotoCreditRecord {
  tenantSlug: string;
  productName: string;
  searchTerm: string;
  imageKey: string;
  pexelsPhotoId: number;
  photographer: string;
  photographerUrl: string;
  photoPageUrl: string;
}

export interface PhotoUploadContext {
  apiKey: string;
  s3Client: S3Client;
  bucket: string;
}

export interface FetchProductPhotoParams {
  tenantId: string;
  tenantSlug: string;
  productName: string;
  searchTerm: string;
}

async function searchPexelsPhoto(term: string, apiKey: string): Promise<PexelsPhoto | null> {
  const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(term)}&per_page=15`;
  const response = await fetch(url, { headers: { Authorization: apiKey } });
  if (!response.ok) throw new Error(`Pexels respondeu ${response.status} pra "${term}"`);

  const body = (await response.json()) as PexelsSearchResponse;
  if (body.photos.length === 0) return null;

  // Landscape/quadrada enquadra melhor no crop 800x800 — mas se a página de
  // resultado só tiver retrato, usa a primeira mesmo assim (fit: 'cover'
  // ainda produz uma foto utilizável, só com mais corte lateral).
  return body.photos.find((photo) => photo.width >= photo.height) ?? body.photos[0] ?? null;
}

async function downloadAndCropSquare(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`download da foto falhou (HTTP ${response.status})`);

  const original = Buffer.from(await response.arrayBuffer());
  return sharp(original)
    .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82 })
    .toBuffer();
}

export async function fetchAndUploadProductPhoto(
  context: PhotoUploadContext,
  params: FetchProductPhotoParams,
): Promise<{ imageKey: string; credit: PhotoCreditRecord } | null> {
  try {
    const photo = await searchPexelsPhoto(params.searchTerm, context.apiKey);
    if (!photo) {
      console.warn(`  [foto] nenhum resultado na Pexels pra "${params.searchTerm}" (${params.productName})`);
      return null;
    }

    const jpeg = await downloadAndCropSquare(photo.src.large2x ?? photo.src.large ?? photo.src.original);
    const imageKey = `products/${params.tenantId}/${randomUUID()}.jpg`;

    await context.s3Client.send(
      new PutObjectCommand({
        Bucket: context.bucket,
        Key: imageKey,
        Body: jpeg,
        ContentType: 'image/jpeg',
      }),
    );

    return {
      imageKey,
      credit: {
        tenantSlug: params.tenantSlug,
        productName: params.productName,
        searchTerm: params.searchTerm,
        imageKey,
        pexelsPhotoId: photo.id,
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
        photoPageUrl: photo.url,
      },
    };
  } catch (error) {
    console.warn(
      `  [foto] falhou pra "${params.productName}" (termo "${params.searchTerm}"): ${(error as Error).message}`,
    );
    return null;
  }
}

/** 200 req/hora no plano gratuito da Pexels — chamado só antes de UMA busca real, nunca antes de um produto pulado. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Licença da Pexels não exige atribuição, mas registrar fotógrafo + URL
 * original é boa prática e serve de trilha de auditoria se algum dia
 * precisarmos justificar a origem de uma foto. Chave por `imageKey` — um
 * rerun do seed que pula produtos já com foto não perde os créditos das
 * fotos antigas.
 */
export function loadPhotoCredits(): Map<string, PhotoCreditRecord> {
  if (!existsSync(CREDITS_FILE)) return new Map();
  const raw = JSON.parse(readFileSync(CREDITS_FILE, 'utf-8')) as PhotoCreditRecord[];
  return new Map(raw.map((record) => [record.imageKey, record]));
}

export function savePhotoCredits(credits: Map<string, PhotoCreditRecord>): void {
  const sorted = [...credits.values()].sort(
    (a, b) => a.tenantSlug.localeCompare(b.tenantSlug) || a.productName.localeCompare(b.productName),
  );
  writeFileSync(CREDITS_FILE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
}
