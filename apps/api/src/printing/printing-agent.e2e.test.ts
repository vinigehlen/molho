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
import { generateDeviceSecret } from './print-device-secret';

/**
 * e2e do fluxo do AGENTE de impressão (NG-06): credencial de dispositivo,
 * rotas /v1/printing/agent/*, rotação, revogação, tenant cruzado, módulo
 * desligado, segredo não vaza. Roda contra o Neon de staging + Redis local
 * (mesmo setup de printing.e2e.test.ts).
 */

function mintStaffToken(userId: string, tenantId: string) {
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
let db: PrismaClient;

interface Graph {
  tenantId: string;
  orderId: string;
  staffToken: string;
}

async function createGraph(slug: string, moduleEnabled = true): Promise<Graph> {
  const tenant = await db.tenant.create({
    data: { slug, name: `Agent ${slug}`, timezone: 'America/Sao_Paulo' },
  });
  await db.tenantEntitlement.create({
    data: { tenantId: tenant.id, moduleKey: 'printing.escpos', source: 'plan', status: 'active' },
  });
  await db.tenantSetting.create({
    data: { tenantId: tenant.id, moduleKey: 'printing.escpos', enabled: moduleEnabled },
  });
  const store = await db.store.create({
    data: { tenantId: tenant.id, name: 'Loja', addressText: 'Rua X, 1', timezone: 'America/Sao_Paulo' },
  });
  const customer = await db.customer.create({
    data: {
      tenantId: tenant.id,
      name: 'Cliente Teste',
      phoneCiphertext: Buffer.from('n/a'),
      phoneLookupHash: `c-${randomUUID()}`,
    },
  });
  const order = await db.order.create({
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
  const category = await db.category.create({
    data: { tenantId: tenant.id, name: 'Lanches', sortOrder: 0, visible: true },
  });
  const product = await db.product.create({
    data: { tenantId: tenant.id, categoryId: category.id, name: 'X-Burger', basePriceCents: 1000 },
  });
  await db.orderItem.create({
    data: {
      tenantId: tenant.id,
      orderId: order.id,
      productId: product.id,
      name: 'X-Burger',
      unitBasePriceCents: 1000,
      quantity: 1,
      lineTotalCents: 1000,
    },
  });
  const user = await db.user.create({
    data: { name: 'Owner Agent E2E', phoneCiphertext: Buffer.from('n/a'), phoneLookupHash: `u-${randomUUID()}` },
  });
  return { tenantId: tenant.id, orderId: order.id, staffToken: mintStaffToken(user.id, tenant.id) };
}

function staffAuth(g: Graph) {
  return { Authorization: `Bearer ${g.staffToken}`, 'X-Tenant-Id': g.tenantId };
}

function deviceAuth(secret: string, tenantId: string) {
  return { Authorization: `Bearer ${secret}`, 'X-Tenant-Id': tenantId };
}

async function pairDevice(g: Graph, name: string): Promise<{ id: string; secret: string; tokenPrefix: string }> {
  const res = await request(app.getHttpServer()).post('/v1/admin/printing/devices').set(staffAuth(g)).send({ name });
  expect(res.status).toBe(201);
  return { id: res.body.device.id, secret: res.body.secret, tokenPrefix: res.body.device.tokenPrefix };
}

function queueJob(g: Graph, idempotencyKey: string) {
  return request(app.getHttpServer())
    .post(`/v1/admin/printing/orders/${g.orderId}/jobs`)
    .set(staffAuth(g))
    .send({ idempotencyKey, width: 80, cut: true });
}

function agentClaim(secret: string, tenantId: string, workerId = 'agent-e2e') {
  return request(app.getHttpServer())
    .post('/v1/printing/agent/jobs/claim')
    .set(deviceAuth(secret, tenantId))
    .send({ workerId, leaseSeconds: 60 });
}

async function withRls<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_platform', 'false', true)`;
    return fn(tx);
  });
}

let main: Graph;
let other: Graph;
let disabled: Graph;
const stamp = Date.now();

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
  main = await createGraph(`e2e-agent-${stamp}`);
  other = await createGraph(`e2e-agent-other-${stamp}`);
  disabled = await createGraph(`e2e-agent-off-${stamp}`, false);
}, 30_000);

afterEach(async () => {
  for (const g of [main, other, disabled]) {
    if (!g) continue;
    await withRls(g.tenantId, (tx) => tx.printJob.deleteMany({ where: { tenantId: g.tenantId } }));
    await withRls(g.tenantId, (tx) => tx.printDevice.deleteMany({ where: { tenantId: g.tenantId } }));
    await db.auditLog.deleteMany({ where: { tenantId: g.tenantId, entity: 'print_device' } });
  }
});

afterAll(async () => {
  for (const g of [main, other, disabled]) {
    if (!g) continue;
    await withRls(g.tenantId, (tx) => tx.printJob.deleteMany({ where: { tenantId: g.tenantId } }));
    await withRls(g.tenantId, (tx) => tx.printDevice.deleteMany({ where: { tenantId: g.tenantId } }));
    await db.auditLog.deleteMany({ where: { tenantId: g.tenantId } });
    await db.orderItem.deleteMany({ where: { tenantId: g.tenantId } });
    await db.order.deleteMany({ where: { tenantId: g.tenantId } });
    await db.product.deleteMany({ where: { tenantId: g.tenantId } });
    await db.category.deleteMany({ where: { tenantId: g.tenantId } });
    await db.customer.deleteMany({ where: { tenantId: g.tenantId } });
    await db.store.deleteMany({ where: { tenantId: g.tenantId } });
    await db.tenantSetting.deleteMany({ where: { tenantId: g.tenantId } });
    await db.tenantEntitlement.deleteMany({ where: { tenantId: g.tenantId } });
    await db.tenant.delete({ where: { id: g.tenantId } }).catch(() => undefined);
  }
  await db?.user.deleteMany({ where: { name: 'Owner Agent E2E' } });
  await db?.$disconnect();
  await app?.close();
}, 20_000);

describe('Printing agent e2e (NG-06)', () => {
  it('emissão: parear devolve segredo molho_pd_ uma vez; listar nunca devolve segredo/hash', async () => {
    const dev = await pairDevice(main, 'Cozinha');
    expect(dev.secret).toMatch(/^molho_pd_/);
    expect(dev.tokenPrefix).toHaveLength(12);

    const list = await request(app.getHttpServer()).get('/v1/admin/printing/devices').set(staffAuth(main)).expect(200);
    const row = list.body.find((d: { id: string }) => d.id === dev.id);
    expect(row.name).toBe('Cozinha');
    expect(JSON.stringify(list.body)).not.toContain(dev.secret);
    expect(JSON.stringify(list.body)).not.toContain('token_hash');
    expect(row).not.toHaveProperty('tokenHash');
  }, 20_000);

  it('uso: agente reivindica, imprime e confirma; heartbeat marca last_seen_at', async () => {
    const dev = await pairDevice(main, 'Cozinha');
    const job = await queueJob(main, `use-${randomUUID()}`).expect(201);

    const claimed = await agentClaim(dev.secret, main.tenantId).expect(200);
    expect(claimed.body.id).toBe(job.body.id);
    expect(claimed.body.ticketText).toContain('1x X-Burger');
    expect(claimed.body.status).toBe('printing');

    await request(app.getHttpServer())
      .post(`/v1/printing/agent/jobs/${claimed.body.id}/printed`)
      .set(deviceAuth(dev.secret, main.tenantId))
      .send({ workerId: 'agent-e2e', version: claimed.body.version })
      .expect(204);

    const [row] = await withRls(main.tenantId, (tx) =>
      tx.printDevice.findMany({ where: { id: dev.id }, select: { lastSeenAt: true } }),
    );
    expect(row?.lastSeenAt).toBeInstanceOf(Date);
  }, 20_000);

  it('fila vazia: claim do agente devolve 200 com {} (não corpo vazio)', async () => {
    const dev = await pairDevice(main, 'Cozinha');
    const res = await agentClaim(dev.secret, main.tenantId).expect(200);
    expect(res.body).toEqual({});
    expect(res.text === '' || res.text === '{}').toBe(true);
  }, 20_000);

  it('restart no meio: reconfirmar com version velha dá 409, agente não reimprime', async () => {
    const dev = await pairDevice(main, 'Cozinha');
    await queueJob(main, `restart-${randomUUID()}`).expect(201);
    const claimed = await agentClaim(dev.secret, main.tenantId).expect(200);

    await request(app.getHttpServer())
      .post(`/v1/printing/agent/jobs/${claimed.body.id}/printed`)
      .set(deviceAuth(dev.secret, main.tenantId))
      .send({ workerId: 'agent-e2e', version: claimed.body.version })
      .expect(204);

    await request(app.getHttpServer())
      .post(`/v1/printing/agent/jobs/${claimed.body.id}/printed`)
      .set(deviceAuth(dev.secret, main.tenantId))
      .send({ workerId: 'agent-e2e', version: claimed.body.version })
      .expect(409);
  }, 20_000);

  it('rotação: segredo velho para de valer, novo funciona, version incrementa', async () => {
    const dev = await pairDevice(main, 'Cozinha');
    const rot = await request(app.getHttpServer())
      .post(`/v1/admin/printing/devices/${dev.id}/rotate`)
      .set(staffAuth(main))
      .expect(200);
    expect(rot.body.secret).toMatch(/^molho_pd_/);
    expect(rot.body.secret).not.toBe(dev.secret);
    expect(rot.body.device.version).toBe(1);

    await agentClaim(dev.secret, main.tenantId).expect(401);
    await queueJob(main, `rot-${randomUUID()}`).expect(201);
    await agentClaim(rot.body.secret, main.tenantId).expect(200);
  }, 20_000);

  it('revogação: efeito imediato, agente recebe 401', async () => {
    const dev = await pairDevice(main, 'Cozinha');
    await queueJob(main, `rev-${randomUUID()}`).expect(201);
    await agentClaim(dev.secret, main.tenantId).expect(200);

    await request(app.getHttpServer())
      .post(`/v1/admin/printing/devices/${dev.id}/revoke`)
      .set(staffAuth(main))
      .expect(204);

    await agentClaim(dev.secret, main.tenantId).expect(401);
  }, 20_000);

  it('tenant cruzado: segredo do B com x-tenant-id do A → 401; B não vê job do A', async () => {
    const devB = await pairDevice(other, 'Cozinha B');
    await agentClaim(devB.secret, main.tenantId).expect(401);

    const jobA = await queueJob(main, `xt-${randomUUID()}`).expect(201);
    const claimedByB = await agentClaim(devB.secret, other.tenantId).expect(200);
    expect(claimedByB.body?.id ?? null).not.toBe(jobA.body.id);
  }, 20_000);

  it('módulo desligado: claim do agente → 403', async () => {
    // A rota de pareamento também exige o módulo, então insere o device direto.
    const { secret, tokenPrefix, tokenHash } = generateDeviceSecret();
    const owner = await db.user.findFirst({ where: { name: 'Owner Agent E2E' }, select: { id: true } });
    await withRls(disabled.tenantId, (tx) =>
      tx.printDevice.create({
        data: {
          tenantId: disabled.tenantId,
          name: 'Cozinha',
          tokenPrefix,
          tokenHash,
          createdBy: owner!.id,
        },
      }),
    );
    await agentClaim(secret, disabled.tenantId).expect(403);
  }, 20_000);

  it('segredo/hash nunca vão pro audit_log', async () => {
    const dev = await pairDevice(main, 'Cozinha');
    await request(app.getHttpServer()).post(`/v1/admin/printing/devices/${dev.id}/rotate`).set(staffAuth(main)).expect(200);
    await request(app.getHttpServer()).post(`/v1/admin/printing/devices/${dev.id}/revoke`).set(staffAuth(main)).expect(204);

    const logs = await db.auditLog.findMany({ where: { tenantId: main.tenantId, entity: 'print_device' } });
    expect(logs.length).toBe(3); // paired + rotated + revoked
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain(dev.secret);
    expect(dump).not.toContain('molho_pd_');
  }, 20_000);

  it('token de staff é rejeitado na rota do agente; segredo de device é rejeitado na rota de staff', async () => {
    const dev = await pairDevice(main, 'Cozinha');

    await request(app.getHttpServer())
      .post('/v1/printing/agent/jobs/claim')
      .set(staffAuth(main))
      .send({ workerId: 'x', leaseSeconds: 60 })
      .expect(401);

    await request(app.getHttpServer())
      .get('/v1/admin/printing/devices')
      .set(deviceAuth(dev.secret, main.tenantId))
      .expect(401);
  }, 20_000);
});
