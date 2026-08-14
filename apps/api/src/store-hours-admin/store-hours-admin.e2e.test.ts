import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import type { PutStoreHoursInput } from '@molho/contracts';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { currentJwtKeyVersion, loadJwtSecrets } from '../auth/token/token-payload';
import { RequestContextService } from '../context/request-context.service';
import { PrismaStoreHoursAdminRepository } from './store-hours-admin.repository';

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

function auth(token = ownerToken, tenant = tenantId) {
  return { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenant };
}

async function provisionTenant(slug: string) {
  const tenant = await prisma.tenant.create({
    data: { slug, name: `Horarios ${slug}`, timezone: 'America/Sao_Paulo' },
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
  await prisma.storeHours.deleteMany({ where: { tenantId: id } });
  await prisma.store.deleteMany({ where: { tenantId: id } });
  await prisma.tenant.delete({ where: { id } }).catch(() => {});
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

  const main = await provisionTenant(`e2e-horarios-${Date.now()}`);
  tenantId = main.tenantId;
  storeId = main.storeId;

  const other = await provisionTenant(`e2e-horarios-other-${Date.now()}`);
  otherTenantId = other.tenantId;
  otherStoreId = other.storeId;

  const owner = await createUser('Owner Horarios');
  const courier = await createUser('Courier Horarios');
  ownerToken = mintAccessToken(owner.id, tenantId);
  courierToken = mintAccessToken(courier.id, tenantId, 'courier');
}, 30_000);

afterAll(async () => {
  await cleanupTenant(tenantId);
  await cleanupTenant(otherTenantId);
  await prisma?.user.deleteMany({ where: { name: { in: ['Owner Horarios', 'Courier Horarios'] } } });
  await prisma?.$disconnect();
  await app?.close();
}, 20_000);

describe('StoreHoursAdminController e2e', () => {
  it('GET começa vazio e PUT salva a semana inteira com N turnos por dia', async () => {
    const empty = await request(app.getHttpServer()).get(`/v1/admin/stores/${storeId}/hours`).set(auth()).expect(200);
    expect(empty.body).toEqual({ shifts: [] });

    const saved = await request(app.getHttpServer())
      .put(`/v1/admin/stores/${storeId}/hours`)
      .set(auth())
      .send({
        shifts: [
          { dayOfWeek: 'monday', opensAtMinutes: 11 * 60, closesAtMinutes: 14 * 60 },
          { dayOfWeek: 'monday', opensAtMinutes: 18 * 60, closesAtMinutes: 23 * 60 },
          { dayOfWeek: 'friday', opensAtMinutes: 22 * 60, closesAtMinutes: 2 * 60 },
        ],
      })
      .expect(200);

    expect(saved.body.shifts).toEqual([
      { dayOfWeek: 'monday', opensAtMinutes: 660, closesAtMinutes: 840 },
      { dayOfWeek: 'monday', opensAtMinutes: 1080, closesAtMinutes: 1380 },
      { dayOfWeek: 'friday', opensAtMinutes: 1320, closesAtMinutes: 120 },
    ]);

    const listed = await request(app.getHttpServer()).get(`/v1/admin/stores/${storeId}/hours`).set(auth()).expect(200);
    expect(listed.body).toEqual(saved.body);
  }, 20_000);

  it('PUT substitui o conjunto inteiro e remover todos os turnos fecha a loja', async () => {
    await request(app.getHttpServer())
      .put(`/v1/admin/stores/${storeId}/hours`)
      .set(auth())
      .send({
        shifts: [
          { dayOfWeek: 'tuesday', opensAtMinutes: 10 * 60, closesAtMinutes: 15 * 60 },
          { dayOfWeek: 'wednesday', opensAtMinutes: 10 * 60, closesAtMinutes: 15 * 60 },
        ],
      })
      .expect(200);

    const replaced = await request(app.getHttpServer())
      .put(`/v1/admin/stores/${storeId}/hours`)
      .set(auth())
      .send({ shifts: [{ dayOfWeek: 'wednesday', opensAtMinutes: 18 * 60, closesAtMinutes: 23 * 60 }] })
      .expect(200);
    expect(replaced.body.shifts).toEqual([
      { dayOfWeek: 'wednesday', opensAtMinutes: 1080, closesAtMinutes: 1380 },
    ]);

    const closed = await request(app.getHttpServer())
      .put(`/v1/admin/stores/${storeId}/hours`)
      .set(auth())
      .send({ shifts: [] })
      .expect(200);
    expect(closed.body).toEqual({ shifts: [] });
  }, 20_000);

  it('validação barra minuto fora da faixa e turno de duração zero', async () => {
    await request(app.getHttpServer())
      .put(`/v1/admin/stores/${storeId}/hours`)
      .set(auth())
      .send({ shifts: [{ dayOfWeek: 'sunday', opensAtMinutes: -1, closesAtMinutes: 10 }] })
      .expect(400);

    const zero = await request(app.getHttpServer())
      .put(`/v1/admin/stores/${storeId}/hours`)
      .set(auth())
      .send({ shifts: [{ dayOfWeek: 'sunday', opensAtMinutes: 600, closesAtMinutes: 600 }] })
      .expect(400);
    expect(zero.body.message).toBe('Turno precisa ter abertura e fechamento diferentes.');
  }, 20_000);

  it('rejeita sobreposição no mesmo dia e na cauda de turno que cruza meia-noite', async () => {
    const sameDay = await request(app.getHttpServer())
      .put(`/v1/admin/stores/${storeId}/hours`)
      .set(auth())
      .send({
        shifts: [
          { dayOfWeek: 'monday', opensAtMinutes: 11 * 60, closesAtMinutes: 14 * 60 },
          { dayOfWeek: 'monday', opensAtMinutes: 13 * 60, closesAtMinutes: 16 * 60 },
        ],
      })
      .expect(400);
    expect(sameDay.body.message).toBe('Turnos não podem se sobrepor, inclusive na virada do dia.');

    const nextDay = await request(app.getHttpServer())
      .put(`/v1/admin/stores/${storeId}/hours`)
      .set(auth())
      .send({
        shifts: [
          { dayOfWeek: 'friday', opensAtMinutes: 22 * 60, closesAtMinutes: 2 * 60 },
          { dayOfWeek: 'saturday', opensAtMinutes: 60, closesAtMinutes: 3 * 60 },
        ],
      })
      .expect(400);
    expect(nextDay.body.message).toBe('Turnos não podem se sobrepor, inclusive na virada do dia.');
  }, 20_000);

  it('reverte o soft-delete se a inserção do novo conjunto falhar', async () => {
    await prisma.storeHours.deleteMany({ where: { tenantId, storeId } });
    await prisma.storeHours.create({
      data: {
        tenantId,
        storeId,
        dayOfWeek: 'thursday',
        opensAtMinutes: 18 * 60,
        closesAtMinutes: 23 * 60,
      },
    });

    const requestContext = app.get(RequestContextService);
    const repository = new PrismaStoreHoursAdminRepository(requestContext);
    const invalidInput = {
      shifts: [{ dayOfWeek: 'invalid-day', opensAtMinutes: 10 * 60, closesAtMinutes: 12 * 60 }],
    } as unknown as PutStoreHoursInput;

    await expect(
      requestContext.run({ tenantId, isPlatform: false }, () => repository.replaceAll(storeId, invalidInput)),
    ).rejects.toThrow();

    const active = await prisma.storeHours.findMany({
      where: { tenantId, storeId, deletedAt: null },
      select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true },
    });
    expect(active).toEqual([{ dayOfWeek: 'thursday', opensAtMinutes: 1080, closesAtMinutes: 1380 }]);
  }, 20_000);

  it('serializa dois PUTs concorrentes e persiste exatamente um conjunto completo', async () => {
    const first = {
      shifts: [{ dayOfWeek: 'tuesday', opensAtMinutes: 10 * 60, closesAtMinutes: 14 * 60 }],
    };
    const second = {
      shifts: [{ dayOfWeek: 'wednesday', opensAtMinutes: 18 * 60, closesAtMinutes: 23 * 60 }],
    };
    const responses = await Promise.all([
      request(app.getHttpServer()).put(`/v1/admin/stores/${storeId}/hours`).set(auth()).send(first),
      request(app.getHttpServer()).put(`/v1/admin/stores/${storeId}/hours`).set(auth()).send(second),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);

    const listed = await request(app.getHttpServer()).get(`/v1/admin/stores/${storeId}/hours`).set(auth()).expect(200);
    expect([first, second]).toContainEqual(listed.body);
  }, 20_000);

  it('RLS/tenant header impede listar ou salvar horário de loja de outro tenant', async () => {
    await request(app.getHttpServer())
      .get(`/v1/admin/stores/${otherStoreId}/hours`)
      .set(auth(ownerToken, tenantId))
      .expect(404);

    await request(app.getHttpServer())
      .put(`/v1/admin/stores/${otherStoreId}/hours`)
      .set(auth(ownerToken, tenantId))
      .send({ shifts: [{ dayOfWeek: 'thursday', opensAtMinutes: 600, closesAtMinutes: 900 }] })
      .expect(404);
  }, 20_000);

  it('ator sem permissão de edição não salva horário', async () => {
    await request(app.getHttpServer())
      .put(`/v1/admin/stores/${storeId}/hours`)
      .set(auth(courierToken, tenantId))
      .send({ shifts: [{ dayOfWeek: 'saturday', opensAtMinutes: 600, closesAtMinutes: 900 }] })
      .expect(403);
  }, 20_000);
});
