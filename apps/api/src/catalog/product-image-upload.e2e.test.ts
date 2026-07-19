import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { currentJwtKeyVersion, loadJwtSecrets } from '../auth/token/token-payload';

/**
 * e2e de verdade: Postgres real + Redis real (rate limit) + R2 real
 * (S3_ACCESS_KEY_ID presente em .env.local — StorageModule escolhe
 * R2StorageProvider, não o Mock). Tokens são MINTADOS direto com o segredo
 * real (mesma chave que JwtAuthGuard valida) em vez de passar pelo fluxo de
 * OTP — esta suíte testa upload/permissão/rate-limit, não OTP (já coberto
 * em auth.e2e.test.ts); logar de verdade só adicionaria ~60s de cooldown
 * por ator sem cobrir nada novo.
 */

function mintAccessToken(userId: string, scopes: { role: string; scopeType: string; scopeId: string | null }[]) {
  const secrets = loadJwtSecrets();
  const version = currentJwtKeyVersion(secrets);
  return jwt.sign(
    {
      sub: userId,
      roles: [...new Set(scopes.map((s) => s.role))],
      scopes,
      tokenVersion: 0,
      deviceId: randomUUID(),
      jti: randomUUID(),
    },
    secrets[version] as string,
    { algorithm: 'HS256', expiresIn: 900, keyid: version },
  );
}

let app: INestApplication;
let migratorPrisma: PrismaClient;
let s3: S3Client;
let tenantId: string;
let productId: string;
let ownerToken: string;
let courierToken: string;
const uploadedKeys: string[] = [];
const testTenantSlug = `e2e-img-${Date.now()}`;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  migratorPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
  s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT as string,
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
    },
  });

  const tenant = await migratorPrisma.tenant.create({
    data: { slug: testTenantSlug, name: 'E2E Image Upload Tenant', timezone: 'America/Sao_Paulo' },
  });
  tenantId = tenant.id;

  const category = await migratorPrisma.category.create({ data: { tenantId, name: 'Categoria E2E' } });
  const product = await migratorPrisma.product.create({
    data: { tenantId, categoryId: category.id, name: 'Produto E2E', basePriceCents: 1000 },
  });
  productId = product.id;

  const ownerUser = await migratorPrisma.user.create({
    data: { name: 'Owner E2E', phoneCiphertext: Buffer.from('n/a'), phoneLookupHash: `owner-${randomUUID()}` },
  });
  ownerToken = mintAccessToken(ownerUser.id, [{ role: 'owner', scopeType: 'tenant', scopeId: tenantId }]);

  const courierUser = await migratorPrisma.user.create({
    data: { name: 'Courier E2E', phoneCiphertext: Buffer.from('n/a'), phoneLookupHash: `courier-${randomUUID()}` },
  });
  courierToken = mintAccessToken(courierUser.id, [{ role: 'courier', scopeType: 'tenant', scopeId: tenantId }]);
}, 30_000);

afterAll(async () => {
  // Guards de propósito: se beforeAll falhar antes de terminar (ex.: erro de
  // DI no app.init()), migratorPrisma/app nunca são atribuídos — sem isso o
  // afterAll mascara o erro real com um TypeError de "undefined" próprio.
  for (const key of uploadedKeys) {
    await s3?.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET as string, Key: key })).catch(() => {});
  }
  if (migratorPrisma) {
    await migratorPrisma.product.deleteMany({ where: { tenantId } });
    await migratorPrisma.category.deleteMany({ where: { tenantId } });
    await migratorPrisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await migratorPrisma.$disconnect();
  }
  await app?.close();
}, 20_000);

function uploadUrlRequest(token: string, body: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post(`/v1/admin/products/${productId}/image/upload-url`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-Id', tenantId)
    .send(body);
}

describe('POST /v1/admin/products/:id/image/upload-url', () => {
  // Validação de DTO (contentType/contentLength) é coberta em
  // product-image.dto.test.ts, não aqui — ver comentário lá sobre o motivo
  // (ValidationPipe depende de emitDecoratorMetadata, que o transform
  // esbuild do Vitest não emite pra @Body(), então essas asserções dariam
  // falso-negativo especificamente sob Test.createTestingModule mesmo com
  // a validação funcionando de verdade — confirmado rodando contra
  // `nest start` real).

  it('1) gera URL assinada com sucesso — key com prefixo products/{tenantId}/, expiresAt ~5min à frente', async () => {
    const before = Date.now();
    const res = await uploadUrlRequest(ownerToken, { contentType: 'image/png', contentLength: 1024 }).expect(201);

    expect(res.body.uploadUrl).toContain('https://');
    expect(res.body.key).toMatch(new RegExp(`^products/${tenantId}/[0-9a-f-]+\\.png$`));
    const expiresAt = new Date(res.body.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(before + 4 * 60 * 1000);
    expect(expiresAt).toBeLessThan(before + 6 * 60 * 1000);
  }, 15_000);

  it('2) produto inexistente no tenant → 404 (RLS protege: nem chega a checar permissão de escrita num recurso que não existe)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/products/${randomUUID()}/image/upload-url`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', tenantId)
      .send({ contentType: 'image/png', contentLength: 1024 })
      .expect(404);
  }, 15_000);

  it('3) ator sem catalog.product.update (courier) → 403', async () => {
    await uploadUrlRequest(courierToken, { contentType: 'image/png', contentLength: 1024 }).expect(403);
  }, 15_000);

  it('4) rate limit: 31ª chamada na mesma hora (tenant+user) → 429 com Retry-After', async () => {
    const rateLimitUser = await migratorPrisma.user.create({
      data: { name: 'RateLimit E2E', phoneCiphertext: Buffer.from('n/a'), phoneLookupHash: `rl-${randomUUID()}` },
    });
    const token = mintAccessToken(rateLimitUser.id, [{ role: 'owner', scopeType: 'tenant', scopeId: tenantId }]);

    for (let i = 0; i < 30; i++) {
      await uploadUrlRequest(token, { contentType: 'image/png', contentLength: 1024 }).expect(201);
    }
    const res = await uploadUrlRequest(token, { contentType: 'image/png', contentLength: 1024 }).expect(429);
    expect(res.headers['retry-after']).toBe('60');
    expect(res.body).toMatchObject({ error: 'rate_limited' });
    // 90s: cada chamada abre 3 mini-transações Neon em sequência (JwtAuthGuard
    // + RequireModuleGuard + TenantContextInterceptor), x31 chamadas — sob
    // latência real de rede pro Neon, isso passa perto de 45s (achado
    // rodando de verdade: timeout em 45_000 sem nenhum erro, só lento).
  }, 90_000);

  it('5) round-trip completo: upload real no R2 → PATCH com imageKey → GET reflete o imageKey; PUT com content-type divergente é rejeitado pelo R2 (403)', async () => {
    const contentType = 'image/png';
    const body = Buffer.alloc(2048, 1);

    const created = await uploadUrlRequest(ownerToken, { contentType, contentLength: body.length }).expect(201);
    const { uploadUrl, key } = created.body;
    uploadedKeys.push(key);

    // PUT de verdade no R2, com Content-Type/Content-Length IDÊNTICOS aos assinados.
    const putOk = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': String(body.length) },
      body,
    });
    expect(putOk.status).toBe(200);

    // Confirma via PATCH existente do produto — nenhum endpoint novo de "confirmar upload".
    const patched = await request(app.getHttpServer())
      .patch(`/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', tenantId)
      .send({ version: 0, imageKey: key })
      .expect(200);
    expect(patched.body.imageKey).toBe(key);

    const fetched = await request(app.getHttpServer())
      .get(`/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', tenantId)
      .expect(200);
    expect(fetched.body.imageKey).toBe(key);

    // Segunda URL, content-type DIFERENTE do assinado na hora do PUT real —
    // prova empírica de que o header assinado não pode ser burlado.
    const created2 = await uploadUrlRequest(ownerToken, { contentType: 'image/png', contentLength: body.length }).expect(
      201,
    );
    uploadedKeys.push(created2.body.key);
    const putMismatched = await fetch(created2.body.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/webp', 'Content-Length': String(body.length) },
      body,
    });
    expect(putMismatched.status).toBe(403);
  }, 45_000);
});
