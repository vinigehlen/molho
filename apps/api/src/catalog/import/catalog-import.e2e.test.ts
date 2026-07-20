import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { currentJwtKeyVersion, loadJwtSecrets } from '../../auth/token/token-payload';

/**
 * e2e de verdade: Postgres real (Neon). Mesmo padrão de
 * product-image-upload.e2e.test.ts — token mintado direto com o segredo
 * real, sem passar pelo fluxo de OTP (não é o que esta suíte testa).
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

function csvBuffer(rows: string[]): Buffer {
  const header = 'categoria,produto,descricao,preco,disponivel';
  return Buffer.from([header, ...rows].join('\n'), 'utf-8');
}

let app: INestApplication;
let migratorPrisma: PrismaClient;
let tenantId: string;
let ownerToken: string;
let courierToken: string;
const testTenantSlug = `e2e-import-${Date.now()}`;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  migratorPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

  const tenant = await migratorPrisma.tenant.create({
    data: { slug: testTenantSlug, name: 'E2E Import Tenant', timezone: 'America/Sao_Paulo' },
  });
  tenantId = tenant.id;

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
  if (migratorPrisma) {
    await migratorPrisma.product.deleteMany({ where: { tenantId } });
    await migratorPrisma.category.deleteMany({ where: { tenantId } });
    await migratorPrisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await migratorPrisma.$disconnect();
  }
  await app?.close();
}, 20_000);

describe('Importação de cardápio por planilha', () => {
  it('1) GET /template devolve um XLSX baixável (conteúdo do arquivo é validado à parte em catalog-import-parser.test.ts, via buildImportTemplate())', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/catalog/import/template')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', tenantId)
      .expect(200);

    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('.xlsx');
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  }, 15_000);

  it('2) POST /preview não grava nada — devolve válidas e com erro separadas', async () => {
    const buffer = csvBuffer(['Lanches,X-Burger,Pão e carne,"24,90",sim', 'Bebidas,,,6.00,sim']);

    const res = await request(app.getHttpServer())
      .post('/v1/admin/catalog/import/preview')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', tenantId)
      .attach('file', buffer, 'cardapio.csv')
      .expect(201);

    expect(res.body.totalRows).toBe(2);
    expect(res.body.createdCount).toBe(1);
    expect(res.body.errorCount).toBe(1);

    const categoriesAfter = await migratorPrisma.category.count({ where: { tenantId } });
    expect(categoriesAfter).toBe(0); // preview não gravou nada
  }, 15_000);

  it('3) POST /commit grava linhas válidas, reporta erro nas outras, reaproveita categoria repetida', async () => {
    const buffer = csvBuffer([
      'Lanches,X-Burger,Pão e carne,"24,90",sim',
      'Lanches,X-Salada,,"22,50",sim',
      'Bebidas,,,6.00,sim',
    ]);

    const res = await request(app.getHttpServer())
      .post('/v1/admin/catalog/import/commit')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', tenantId)
      .attach('file', buffer, 'cardapio.csv')
      .expect(201);

    expect(res.body.totalRows).toBe(3);
    expect(res.body.createdCount).toBe(2);
    expect(res.body.errorCount).toBe(1);

    const categories = await migratorPrisma.category.findMany({ where: { tenantId } });
    expect(categories).toHaveLength(1); // "Lanches" criada só 1 vez pras 2 linhas
    expect(categories[0]?.name).toBe('Lanches');

    const products = await migratorPrisma.product.findMany({ where: { tenantId } });
    expect(products).toHaveLength(2);
  }, 20_000);

  it('4) extensão de arquivo inválida → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/admin/catalog/import/preview')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', tenantId)
      .attach('file', Buffer.from('não é planilha'), 'arquivo.txt')
      .expect(400);
  }, 15_000);

  it('5) ator sem catalog.import (courier) → 403', async () => {
    const buffer = csvBuffer(['Lanches,X-Burger,,24.90,sim']);
    await request(app.getHttpServer())
      .post('/v1/admin/catalog/import/preview')
      .set('Authorization', `Bearer ${courierToken}`)
      .set('X-Tenant-Id', tenantId)
      .attach('file', buffer, 'cardapio.csv')
      .expect(403);
  }, 15_000);
});
