import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { currentJwtKeyVersion, loadJwtSecrets } from '../auth/token/token-payload';

const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-51.2, -29.7],
      [-51.1, -29.7],
      [-51.1, -29.6],
      [-51.2, -29.6],
      [-51.2, -29.7],
    ],
  ],
};

function mintAccessToken(userId: string, tenantId: string, role: 'owner' | 'courier' = 'owner') {
  const secrets = loadJwtSecrets();
  const version = currentJwtKeyVersion(secrets);
  return jwt.sign(
    {
      sub: userId,
      roles: [role],
      scopes: [{ role, scopeType: 'tenant', scopeId: tenantId }],
      tokenVersion: 0,
      deviceId: randomUUID(),
      jti: randomUUID(),
    },
    secrets[version] as string,
    { algorithm: 'HS256', expiresIn: 900, keyid: version },
  );
}

let app: INestApplication;
let prisma: PrismaClient;
let tenantId: string;
let otherTenantId: string;
let storeId: string;
let otherStoreId: string;
let ownerToken: string;
let courierToken: string;
let otherOwnerToken: string;

function auth(token = ownerToken, tenant = tenantId) {
  return { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenant };
}

async function provisionTenant(slug: string) {
  const tenant = await prisma.tenant.create({
    data: { slug, name: `Zonas ${slug}`, timezone: 'America/Sao_Paulo' },
  });
  await prisma.tenantEntitlement.create({
    data: { tenantId: tenant.id, moduleKey: 'delivery.zones', source: 'plan', status: 'active' },
  });
  await prisma.tenantSetting.create({
    data: { tenantId: tenant.id, moduleKey: 'delivery.zones', enabled: true },
  });
  const store = await prisma.store.create({
    data: { tenantId: tenant.id, name: `Loja ${slug}`, addressText: 'Rua X, 1', timezone: 'America/Sao_Paulo' },
  });
  return { tenantId: tenant.id, storeId: store.id };
}

async function createUser(name: string) {
  return prisma.user.create({
    data: { name, phoneCiphertext: Buffer.from('n/a'), phoneLookupHash: `${name}-${randomUUID()}` },
  });
}

async function cleanupTenant(id: string) {
  if (!id) return;
  await prisma.$executeRaw`DELETE FROM "delivery_zones" WHERE "tenant_id" = ${id}::uuid`;
  await prisma.store.deleteMany({ where: { tenantId: id } });
  await prisma.tenantSetting.deleteMany({ where: { tenantId: id } });
  await prisma.tenantEntitlement.deleteMany({ where: { tenantId: id } });
  await prisma.tenant.delete({ where: { id } }).catch(() => {});
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

  const main = await provisionTenant(`e2e-zonas-${Date.now()}`);
  tenantId = main.tenantId;
  storeId = main.storeId;

  const other = await provisionTenant(`e2e-zonas-other-${Date.now()}`);
  otherTenantId = other.tenantId;
  otherStoreId = other.storeId;

  const owner = await createUser('Owner Zonas');
  const courier = await createUser('Courier Zonas');
  const otherOwner = await createUser('Other Owner Zonas');
  ownerToken = mintAccessToken(owner.id, tenantId);
  courierToken = mintAccessToken(courier.id, tenantId, 'courier');
  otherOwnerToken = mintAccessToken(otherOwner.id, otherTenantId);
}, 30_000);

afterAll(async () => {
  await cleanupTenant(tenantId);
  await cleanupTenant(otherTenantId);
  await prisma?.user.deleteMany({ where: { name: { in: ['Owner Zonas', 'Courier Zonas', 'Other Owner Zonas'] } } });
  await prisma?.$disconnect();
  await app?.close();
}, 20_000);

describe('DeliveryZoneAdminController e2e', () => {
  it('cria, lista, atualiza e soft-delete zona por cidade', async () => {
    const created = await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .send({
        kind: 'city',
        name: 'Estância Velha',
        city: 'Estância Velha',
        state: 'RS',
        feeCents: 800,
        etaMinMinutes: 30,
        etaMaxMinutes: 50,
        priority: 0,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Estância Velha',
      kind: 'city',
      city: 'Estância Velha',
      state: 'RS',
      feeCents: 800,
      etaMinMinutes: 30,
      etaMaxMinutes: 50,
      priority: 0,
    });

    const listed = await request(app.getHttpServer())
      .get(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].id).toBe(created.body.id);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/admin/delivery-zones/${created.body.id}`)
      .set(auth())
      .send({
        kind: 'city',
        name: 'Portão',
        city: 'Portão',
        state: 'RS',
        feeCents: 1500,
        etaMinMinutes: 40,
        etaMaxMinutes: 60,
        priority: 2,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      name: 'Portão',
      city: 'Portão',
      feeCents: 1500,
      etaMinMinutes: 40,
      etaMaxMinutes: 60,
      priority: 2,
    });

    await request(app.getHttpServer()).delete(`/v1/admin/delivery-zones/${created.body.id}`).set(auth()).expect(204);

    const afterDelete = await request(app.getHttpServer())
      .get(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .expect(200);
    expect(afterDelete.body).toEqual([]);
  }, 20_000);

  it('duplicata por molho_city_key(city)+UF na mesma loja devolve 409 e soft-delete libera recriação', async () => {
    const body = {
      kind: 'city',
      name: 'Novo Hamburgo',
      city: 'Novo Hamburgo',
      state: 'RS',
      feeCents: 1500,
      etaMinMinutes: 35,
      etaMaxMinutes: 55,
      priority: 1,
    };

    const first = await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .send(body)
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .send({ ...body, name: 'NH duplicada', city: ' novo hamburgo ' })
      .expect(409);
    expect(duplicate.body.message).toBe('Já existe uma zona para esta cidade e UF nesta loja.');

    await request(app.getHttpServer()).delete(`/v1/admin/delivery-zones/${first.body.id}`).set(auth()).expect(204);

    await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .send({ ...body, name: 'NH recriada' })
      .expect(201);
  }, 20_000);

  it('update que colide com cidade já cadastrada devolve 409', async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .send({
        kind: 'city',
        name: 'Campo Bom',
        city: 'Campo Bom',
        state: 'RS',
        feeCents: 1000,
        etaMinMinutes: 20,
        etaMaxMinutes: 40,
        priority: 0,
      })
      .expect(201);

    const sapiranga = await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .send({
        kind: 'city',
        name: 'Sapiranga',
        city: 'Sapiranga',
        state: 'RS',
        feeCents: 1200,
        etaMinMinutes: 25,
        etaMaxMinutes: 45,
        priority: 1,
      })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .patch(`/v1/admin/delivery-zones/${sapiranga.body.id}`)
      .set(auth())
      .send({
        kind: 'city',
        name: 'Campo Bom duplicada',
        city: ' campo bom ',
        state: 'RS',
        feeCents: 1300,
        etaMinMinutes: 25,
        etaMaxMinutes: 45,
        priority: 1,
      })
      .expect(409);

    expect(duplicate.body.message).toBe('Já existe uma zona para esta cidade e UF nesta loja.');
  }, 20_000);

  it('cria zona por polígono e substitui por cidade no update replace', async () => {
    const created = await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .send({
        kind: 'polygon',
        name: 'Zona por raio',
        polygon,
        feeCents: 1200,
        etaMinMinutes: 25,
        etaMaxMinutes: 45,
        priority: 3,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Zona por raio',
      kind: 'polygon',
      city: null,
      state: null,
      feeCents: 1200,
      etaMinMinutes: 25,
      etaMaxMinutes: 45,
      priority: 3,
    });

    const updated = await request(app.getHttpServer())
      .patch(`/v1/admin/delivery-zones/${created.body.id}`)
      .set(auth())
      .send({
        kind: 'city',
        name: 'Ivoti',
        city: 'Ivoti',
        state: 'RS',
        feeCents: 1500,
        etaMinMinutes: 35,
        etaMaxMinutes: 55,
        priority: 0,
      })
      .expect(200);

    expect(updated.body).toMatchObject({ kind: 'city', city: 'Ivoti', state: 'RS' });
  }, 20_000);

  it('validação server-side barra ETA inválido e payload que mistura cidade com polígono', async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .send({
        kind: 'city',
        name: 'Cidade inválida',
        city: 'Dois Irmãos',
        state: 'RS',
        feeCents: 1000,
        etaMinMinutes: 60,
        etaMaxMinutes: 30,
        priority: 0,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth())
      .send({
        kind: 'city',
        name: 'XOR inválido',
        city: 'Campo Bom',
        state: 'RS',
        polygon,
        feeCents: 1000,
        etaMinMinutes: 20,
        etaMaxMinutes: 30,
        priority: 0,
      })
      .expect(400);
  }, 20_000);

  it('RLS/tenant header impede acessar loja ou zona de outro tenant', async () => {
    await request(app.getHttpServer())
      .get(`/v1/admin/stores/${otherStoreId}/delivery-zones`)
      .set(auth(ownerToken, tenantId))
      .expect(404);

    const otherZone = await request(app.getHttpServer())
      .post(`/v1/admin/stores/${otherStoreId}/delivery-zones`)
      .set(auth(otherOwnerToken, otherTenantId))
      .send({
        kind: 'city',
        name: 'Canoas',
        city: 'Canoas',
        state: 'RS',
        feeCents: 1800,
        etaMinMinutes: 50,
        etaMaxMinutes: 70,
        priority: 0,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/admin/delivery-zones/${otherZone.body.id}`)
      .set(auth(ownerToken, tenantId))
      .send({
        kind: 'city',
        name: 'Canoas editada',
        city: 'Canoas',
        state: 'RS',
        feeCents: 1900,
        etaMinMinutes: 50,
        etaMaxMinutes: 70,
        priority: 0,
      })
      .expect(404);
  }, 20_000);

  it('ator sem permissão de edição não cria zona', async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/delivery-zones`)
      .set(auth(courierToken, tenantId))
      .send({
        kind: 'city',
        name: 'Sem permissão',
        city: 'Sapiranga',
        state: 'RS',
        feeCents: 1000,
        etaMinMinutes: 20,
        etaMaxMinutes: 30,
        priority: 0,
      })
      .expect(403);
  }, 20_000);
});
