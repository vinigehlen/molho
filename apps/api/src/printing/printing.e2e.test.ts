import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import type { Prisma } from '@molho/db';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { currentJwtKeyVersion, loadJwtSecrets } from '../auth/token/token-payload';

function mintAccessToken(userId: string, tenantId: string) {
  const secrets = loadJwtSecrets();
  const version = currentJwtKeyVersion(secrets);
  return jwt.sign(
    {
      sub: userId,
      roles: ['owner'],
      scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: tenantId }],
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
let tenantId: string;
let otherTenantId: string;
let orderId: string;
let otherOrderId: string;
let ownerToken: string;
let otherOwnerToken: string;

const slug = `e2e-print-${Date.now()}`;
const otherSlug = `e2e-print-other-${Date.now()}`;

async function createTenantGraph(slugValue: string) {
  const tenant = await migratorPrisma.tenant.create({
    data: { slug: slugValue, name: `Printing ${slugValue}`, timezone: 'America/Sao_Paulo' },
  });
  await migratorPrisma.tenantEntitlement.create({
    data: { tenantId: tenant.id, moduleKey: 'printing.escpos', source: 'plan', status: 'active' },
  });
  await migratorPrisma.tenantSetting.create({
    data: { tenantId: tenant.id, moduleKey: 'printing.escpos', enabled: true },
  });

  const store = await migratorPrisma.store.create({
    data: { tenantId: tenant.id, name: 'Loja Impressao', addressText: 'Rua X, 1', timezone: 'America/Sao_Paulo' },
  });
  const customer = await migratorPrisma.customer.create({
    data: {
      tenantId: tenant.id,
      name: 'Maria',
      phoneCiphertext: Buffer.from('n/a'),
      phoneLookupHash: `customer-${randomUUID()}`,
    },
  });
  const order = await migratorPrisma.order.create({
    data: {
      tenantId: tenant.id,
      storeId: store.id,
      customerId: customer.id,
      fulfillmentType: 'pickup',
      paymentMethod: 'pix',
      subtotalCents: 1000,
      deliveryFeeCents: 0,
      totalCents: 1000,
      customerVerified: true,
    },
  });
  const category = await migratorPrisma.category.create({
    data: { tenantId: tenant.id, name: 'Lanches', sortOrder: 0, visible: true },
  });
  const product = await migratorPrisma.product.create({
    data: { tenantId: tenant.id, categoryId: category.id, name: 'X-Burger', basePriceCents: 1000 },
  });
  const item = await migratorPrisma.orderItem.create({
    data: {
      tenantId: tenant.id,
      orderId: order.id,
      productId: product.id,
      name: 'X-Burger',
      unitBasePriceCents: 1000,
      quantity: 1,
      notes: 'sem cebola',
      lineTotalCents: 1000,
    },
  });
  const group = await migratorPrisma.modifierGroup.create({
    data: { tenantId: tenant.id, productId: product.id, name: 'Adicionais', min: 0, max: 2 },
  });
  const modifier = await migratorPrisma.modifier.create({
    data: { tenantId: tenant.id, groupId: group.id, name: 'Bacon', priceDeltaCents: 300 },
  });
  await migratorPrisma.orderItemModifier.create({
    data: { tenantId: tenant.id, orderItemId: item.id, modifierId: modifier.id, name: 'Bacon', priceDeltaCents: 300 },
  });

  const user = await migratorPrisma.user.create({
    data: { name: 'Owner Impressao', phoneCiphertext: Buffer.from('n/a'), phoneLookupHash: `owner-${randomUUID()}` },
  });
  return { tenantId: tenant.id, orderId: order.id, token: mintAccessToken(user.id, tenant.id) };
}

function auth(token = ownerToken, tenant = tenantId) {
  return { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenant };
}

/** POST .../jobs cria SEMPRE 2 vias (balcão + cozinha). Devolve a resposta crua (array). */
function createJob(idempotencyPrefix: string, tenant = tenantId, token = ownerToken, targetOrder = orderId) {
  return request(app.getHttpServer())
    .post(`/v1/admin/printing/orders/${targetOrder}/jobs`)
    .set(auth(token, tenant))
    .send({ idempotencyPrefix, width: 80, cut: true });
}

/** Enfileira as 2 vias e falha todas menos a 1ª — os testes de mecânica de fila
 *  só precisam de UM job claimável. Devolve o job que sobrou. */
async function queueOneJob(
  prefix: string,
  tenant = tenantId,
  token = ownerToken,
  targetOrder = orderId,
): Promise<{ id: string; version: number }> {
  const res = await createJob(prefix, tenant, token, targetOrder).expect(201);
  const jobs = res.body as { id: string; version: number }[];
  const extra = jobs.slice(1).map((j) => j.id);
  if (extra.length > 0) {
    await withTenantRls(tenant, (tx) => tx.printJob.updateMany({ where: { id: { in: extra } }, data: { status: 'failed' } }));
  }
  return jobs[0]!;
}

async function withTenantRls<T>(targetTenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return migratorPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${targetTenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_platform', 'false', true)`;
    return fn(tx);
  });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  migratorPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
  const main = await createTenantGraph(slug);
  tenantId = main.tenantId;
  orderId = main.orderId;
  ownerToken = main.token;

  const other = await createTenantGraph(otherSlug);
  otherTenantId = other.tenantId;
  otherOrderId = other.orderId;
  otherOwnerToken = other.token;
}, 30_000);

afterAll(async () => {
  for (const id of [tenantId, otherTenantId]) {
    if (!id) continue;
    await withTenantRls(id, (tx) => tx.printJob.deleteMany({ where: { tenantId: id } }));
    await migratorPrisma.orderItemModifier.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.orderItem.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.order.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.modifier.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.modifierGroup.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.product.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.category.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.customer.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.store.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.tenantSetting.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.tenantEntitlement.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.tenant.delete({ where: { id } }).catch(() => {});
  }
  await migratorPrisma?.user.deleteMany({ where: { name: 'Owner Impressao' } });
  await migratorPrisma?.$disconnect();
  await app?.close();
}, 20_000);

afterEach(async () => {
  for (const id of [tenantId, otherTenantId]) {
    if (!id) continue;
    await withTenantRls(id, (tx) => tx.printJob.deleteMany({ where: { tenantId: id } }));
  }
});

describe('Printing e2e', () => {
  it('cria as 2 vias idempotentes: balcão com tudo, cozinha sem preço/endereço', async () => {
    const first = await createJob('manual-idempotente').expect(201);
    const second = await createJob('manual-idempotente').expect(201);

    const a = first.body as { id: string; idempotencyKey: string; ticketText: string }[];
    const b = second.body as { id: string }[];
    expect(a).toHaveLength(2);
    expect(b.map((j) => j.id).sort()).toEqual(a.map((j) => j.id).sort()); // idempotente

    const counter = a.find((j) => j.idempotencyKey.endsWith(':counter'))!;
    const kitchen = a.find((j) => j.idempotencyKey.endsWith(':kitchen'))!;

    expect(counter.ticketText).toContain('VIA BALCAO');
    expect(counter.ticketText).toMatch(/PEDIDO #\d{5}/);
    expect(counter.ticketText).toContain('1x X-Burger');
    expect(counter.ticketText).toContain('R$');

    expect(kitchen.ticketText).toContain('VIA COZINHA');
    expect(kitchen.ticketText).toMatch(/PEDIDO #\d{5}/);
    expect(kitchen.ticketText).toContain('+ Bacon');
    expect(kitchen.ticketText).toContain('Obs: sem cebola');
    expect(kitchen.ticketText).not.toContain('R$');
    expect(kitchen.ticketText).not.toContain('Rua');
  }, 15_000);

  it('pedidos do mesmo tenant recebem números sequenciais distintos', async () => {
    const order2 = await migratorPrisma.order.create({
      data: {
        tenantId,
        storeId: (await migratorPrisma.store.findFirstOrThrow({ where: { tenantId } })).id,
        customerId: (await migratorPrisma.customer.findFirstOrThrow({ where: { tenantId } })).id,
        fulfillmentType: 'pickup',
        paymentMethod: 'pix',
        subtotalCents: 500,
        deliveryFeeCents: 0,
        totalCents: 500,
        customerVerified: true,
      },
      select: { id: true, orderNumber: true },
    });
    const order1Number = (await migratorPrisma.order.findFirstOrThrow({ where: { id: orderId }, select: { orderNumber: true } }))
      .orderNumber;
    expect(order1Number).not.toBeNull();
    expect(order2.orderNumber).not.toBeNull();
    expect(order2.orderNumber).toBe((order1Number ?? 0) + 1);
    await migratorPrisma.order.delete({ where: { id: order2.id } });
  }, 15_000);

  it('claim pula job travado por outra transacao com FOR UPDATE SKIP LOCKED', async () => {
    const locked = await queueOneJob('locked-job');
    const free = await queueOneJob('free-job');

    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    const locker = migratorPrisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.is_platform', 'false', true)`;
        await tx.$queryRaw`
          SELECT "id" FROM "print_jobs" WHERE "id" = ${locked.id}::uuid FOR UPDATE
        `;
        await hold;
      },
      { timeout: 10_000, maxWait: 5_000 },
    );

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const claimed = await request(app.getHttpServer())
        .post('/v1/admin/printing/jobs/claim')
        .set(auth())
        .send({ workerId: 'worker-skip', leaseSeconds: 60 })
        .expect(200);

      expect(claimed.body.id).toBe(free.id);
      expect(claimed.body.id).not.toBe(locked.id);
      expect(claimed.body.status).toBe('printing');
      expect(claimed.body.leasedBy).toBe('worker-skip');
      expect(claimed.body.version).toBe(1);
    } finally {
      release();
      await locker;
    }
  }, 15_000);

  it('re-lease pega job printing com lease expirado', async () => {
    const created = await queueOneJob('expired-lease');
    await withTenantRls(tenantId, (tx) => tx.$executeRaw`
        UPDATE "print_jobs"
        SET "status" = 'printing', "leased_by" = 'dead-worker', "lease_until" = now() - interval '1 second', "version" = "version" + 1
        WHERE "id" = ${created.id}::uuid
      `);

    const claimed = await request(app.getHttpServer())
      .post('/v1/admin/printing/jobs/claim')
      .set(auth())
      .send({ workerId: 'worker-new', leaseSeconds: 60 })
      .expect(200);

    expect(claimed.body.id).toBe(created.id);
    expect(claimed.body.leasedBy).toBe('worker-new');
    expect(claimed.body.version).toBe(2);
  }, 15_000);

  it('conclusao stale com version antiga devolve 409', async () => {
    const created = await queueOneJob('stale-finish');
    const claimed = await request(app.getHttpServer())
      .post('/v1/admin/printing/jobs/claim')
      .set(auth())
      .send({ workerId: 'worker-finish', leaseSeconds: 60 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/admin/printing/jobs/${created.id}/printed`)
      .set(auth())
      .send({ workerId: 'worker-finish', version: claimed.body.version - 1 })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/v1/admin/printing/jobs/${created.id}/printed`)
      .set(auth())
      .send({ workerId: 'worker-finish', version: claimed.body.version })
      .expect(204);
  }, 15_000);

  it('RLS impede tenant A de criar ou claimar job do tenant B', async () => {
    await createJob('cross-tenant-create', tenantId, ownerToken, otherOrderId).expect(404);

    const otherJob = await queueOneJob('other-tenant-job', otherTenantId, otherOwnerToken, otherOrderId);
    const claimedByA = await request(app.getHttpServer())
      .post('/v1/admin/printing/jobs/claim')
      .set(auth(ownerToken, tenantId))
      .send({ workerId: 'worker-a', leaseSeconds: 60 })
      .expect(200);

    expect(claimedByA.body?.id).not.toBe(otherJob.id);
  }, 15_000);

  it('claim sem job elegivel retorna null', async () => {
    await withTenantRls(tenantId, (tx) =>
      tx.printJob.updateMany({
        where: { tenantId, status: { in: ['queued', 'printing'] } },
        data: { status: 'failed', leasedBy: null, leaseUntil: null, version: { increment: 1 } },
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/v1/admin/printing/jobs/claim')
      .set(auth())
      .send({ workerId: 'worker-empty', leaseSeconds: 60 })
      .expect(200);

    expect(res.body).toEqual({});
  }, 15_000);
});
