import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, encryptEmail, encryptPhone, hashEmailForLookup, hashPhoneForLookup } from '@molho/db';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { EMAIL_PROVIDER, MESSAGING_PROVIDER } from '../messaging/messaging.module';
import type { MockEmailProvider } from '../messaging/mock-email.provider';
import type { MockMessagingProvider } from '../messaging/mock-messaging.provider';

/**
 * e2e de verdade: Postgres real (RLS) + Redis real. Canal de staff forçado
 * pra 'email' (mesmo racional de counter-order.e2e.test.ts) — cliente usa o
 * canal SMS normal (MockMessagingProvider, sem ZENVIA_API_KEY).
 *
 * Pedido de partida é inserido DIRETO no banco (bypass do checkout/balcão —
 * os dois já têm e2e próprio pra criação; aqui o que importa é o estado
 * `received/preparing/ready` com itens dentro), mesmo padrão de "arrange via
 * migratorPrisma" que counter-order.e2e usa pro produto/categoria.
 */

function randomEmail(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}@e2e.molho.test`;
}

function randomPhone(): string {
  const suffix = randomBytes(4).readUInt32BE(0) % 100_000_000;
  return `+55519${String(suffix).padStart(8, '0')}`;
}

function extractCode(message: string): string {
  const match = message.match(/\d{6}/);
  if (!match) throw new Error(`sem código de 6 dígitos em "${message}"`);
  return match[0];
}

let app: INestApplication;
let migratorPrisma: PrismaClient;
const originalOtpChannelStaff = process.env.OTP_CHANNEL_STAFF;

let tenantId: string;
let slug: string;
let storeId: string;
let categoryId: string;
let productId: string; // basePriceCents = 800
let otherTenantId: string;
let otherStoreId: string;
const createdEmails: string[] = [];

async function seedManager(email: string): Promise<void> {
  const { ciphertext, keyVersion } = encryptEmail(email);
  const user = await migratorPrisma.user.create({
    data: { name: email, emailCiphertext: Buffer.from(ciphertext), emailLookupHash: hashEmailForLookup(email), emailKeyVersion: keyVersion },
  });
  await migratorPrisma.userRole.create({
    data: { userId: user.id, role: 'manager', scopeType: 'tenant', scopeId: tenantId },
  });
}

async function staffToken(): Promise<string> {
  const email = randomEmail('manager');
  createdEmails.push(email);
  await seedManager(email);
  await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ email }).expect(202);
  const mock = app.get<MockEmailProvider>(EMAIL_PROVIDER);
  const sent = mock.getSentEmails();
  const last = sent[sent.length - 1];
  if (!last) throw new Error('nenhum e-mail enviado pelo MockEmailProvider');
  const code = extractCode(last.text);
  const res = await request(app.getHttpServer()).post('/v1/auth/otp/verify').send({ email, code }).expect(200);
  return res.body.accessToken as string;
}

async function customerToken(): Promise<string> {
  const phone = randomPhone();
  await request(app.getHttpServer()).post(`/v1/store/${slug}/auth/otp/request`).send({ phone }).expect(202);
  const mock = app.get<MockMessagingProvider>(MESSAGING_PROVIDER);
  const sent = mock.getSentMessages();
  const last = sent[sent.length - 1];
  if (!last) throw new Error('nenhuma mensagem enviada pelo MockMessagingProvider');
  const code = extractCode(last.message);
  const res = await request(app.getHttpServer())
    .post(`/v1/store/${slug}/auth/otp/verify`)
    .send({ phone, code })
    .expect(200);
  return res.body.accessToken as string;
}

/** Insere um pedido + itens direto no banco — bypass do checkout/balcão (que já têm e2e próprio). */
async function createOrder(
  status: 'received' | 'preparing' | 'ready' | 'completed',
  items: { quantity: number; unitBasePriceCents: number }[],
): Promise<{ orderId: string; itemIds: string[] }> {
  const phone = randomPhone();
  const { ciphertext, keyVersion } = encryptPhone(phone);
  const customer = await migratorPrisma.customer.create({
    data: { tenantId, name: 'Cliente E2E', phoneCiphertext: Buffer.from(ciphertext), phoneLookupHash: hashPhoneForLookup(phone), phoneKeyVersion: keyVersion },
  });

  const subtotalCents = items.reduce((sum, i) => sum + i.unitBasePriceCents * i.quantity, 0);
  const order = await migratorPrisma.order.create({
    data: {
      tenantId,
      storeId,
      customerId: customer.id,
      status,
      paymentMethod: 'cash_on_delivery',
      fulfillmentType: 'pickup',
      customerVerified: true,
      subtotalCents,
      deliveryFeeCents: 0,
      totalCents: subtotalCents,
    },
  });

  const itemIds: string[] = [];
  for (const item of items) {
    const orderItem = await migratorPrisma.orderItem.create({
      data: {
        tenantId,
        orderId: order.id,
        productId,
        name: 'Coxinha',
        unitBasePriceCents: item.unitBasePriceCents,
        quantity: item.quantity,
        lineTotalCents: item.unitBasePriceCents * item.quantity,
      },
    });
    itemIds.push(orderItem.id);
  }

  return { orderId: order.id, itemIds };
}

function post(token: string, orderId: string, idempotencyKey: string | undefined, body: Record<string, unknown>) {
  const req = request(app.getHttpServer())
    .post(`/v1/admin/stores/${storeId}/orders/${orderId}/adjustments`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-Id', tenantId);
  if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
  return req.send(body);
}

beforeAll(async () => {
  process.env.OTP_CHANNEL_STAFF = 'email';

  const redisCleanup = new Redis(process.env.REDIS_URL as string);
  const ipKeys = await redisCleanup.keys('otp_rl:ip:*');
  if (ipKeys.length) await redisCleanup.del(...ipKeys);
  redisCleanup.disconnect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  migratorPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

  slug = `e2e-order-adjust-${Date.now()}`;
  const tenant = await migratorPrisma.tenant.create({ data: { slug, name: 'Ajuste E2E', timezone: 'America/Sao_Paulo' } });
  tenantId = tenant.id;

  const store = await migratorPrisma.store.create({
    data: { tenantId, name: 'Ajuste E2E', addressText: 'Rua X, 1', timezone: 'America/Sao_Paulo' },
  });
  storeId = store.id;

  const category = await migratorPrisma.category.create({ data: { tenantId, name: 'Salgados', sortOrder: 0, visible: true } });
  categoryId = category.id;
  const product = await migratorPrisma.product.create({
    data: { tenantId, categoryId, name: 'Coxinha', basePriceCents: 800, available: true },
  });
  productId = product.id;

  // Segunda loja, MESMO tenant — prova que storeId da URL é checado, não só tenant.
  const otherStore = await migratorPrisma.store.create({
    data: { tenantId, name: 'Outra Loja E2E', addressText: 'Rua Y, 2', timezone: 'America/Sao_Paulo' },
  });
  otherStoreId = otherStore.id;

  // Tenant DIFERENTE — prova RLS (404, nunca vaza item de outro tenant).
  const otherSlug = `e2e-order-adjust-other-${Date.now()}`;
  const otherTenant = await migratorPrisma.tenant.create({ data: { slug: otherSlug, name: 'Outro Tenant E2E', timezone: 'America/Sao_Paulo' } });
  otherTenantId = otherTenant.id;
}, 30_000);

afterAll(async () => {
  if (originalOtpChannelStaff === undefined) delete process.env.OTP_CHANNEL_STAFF;
  else process.env.OTP_CHANNEL_STAFF = originalOtpChannelStaff;

  if (typeof migratorPrisma !== 'undefined') {
    const hashes = createdEmails.map(hashEmailForLookup);
    const actors = hashes.length
      ? await migratorPrisma.user.findMany({ where: { emailLookupHash: { in: hashes } }, select: { id: true } })
      : [];
    if (actors.length) {
      await migratorPrisma.auditLog.deleteMany({ where: { actorId: { in: actors.map((u) => u.id) } } });
    }

    for (const id of [tenantId, otherTenantId].filter((x): x is string => typeof x === 'string')) {
      await migratorPrisma.orderAdjustment.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.orderItemModifier.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.orderItem.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.orderStatusHistory.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.order.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.customer.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.product.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.category.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.store.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.tenant.delete({ where: { id } }).catch(() => {});
    }
    for (const email of createdEmails) {
      await migratorPrisma.user.deleteMany({ where: { emailLookupHash: hashEmailForLookup(email) } });
    }
    await migratorPrisma.$disconnect();
  }
  if (typeof app !== 'undefined') await app.close();
}, 30_000);

describe('POST /v1/admin/stores/:storeId/orders/:orderId/adjustments', () => {
  it('add_item: currentTotalCents sobe do preço do CATÁLOGO, nunca de um valor no body', async () => {
    const token = await staffToken();
    const { orderId } = await createOrder('preparing', [{ quantity: 2, unitBasePriceCents: 800 }]); // subtotal 1600

    const res = await post(token, orderId, randomUUID(), { kind: 'add_item', productId, quantity: 3 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ orderId, currentSubtotalCents: 1600 + 800 * 3, currentTotalCents: 1600 + 800 * 3 });

    const order = await migratorPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.currentSubtotalCents).toBe(1600 + 2400);
    expect(order.currentTotalCents).toBe(1600 + 2400);
  }, 15_000);

  it('add_item ignora qualquer preço mandado no body — só productId/quantity contam', async () => {
    const token = await staffToken();
    const { orderId } = await createOrder('received', [{ quantity: 1, unitBasePriceCents: 800 }]);

    const res = await post(token, orderId, randomUUID(), {
      kind: 'add_item',
      productId,
      quantity: 1,
      lineTotalCents: 1, // campo estranho ao schema — zod descarta, nunca chega no preço
    });

    expect(res.status).toBe(201);
    expect(res.body.currentSubtotalCents).toBe(800 + 800); // 800 do catálogo, nunca "1"
  });

  it('remove_item: currentTotalCents cai, item some do efetivo (não pode ser removido de novo)', async () => {
    const token = await staffToken();
    const { orderId, itemIds } = await createOrder('preparing', [
      { quantity: 2, unitBasePriceCents: 800 },
      { quantity: 1, unitBasePriceCents: 500 },
    ]); // subtotal 2100

    const res = await post(token, orderId, randomUUID(), { kind: 'remove_item', orderItemId: itemIds[0] });

    expect(res.status).toBe(201);
    expect(res.body.currentSubtotalCents).toBe(2100 - 1600); // 500
    expect(res.body.currentTotalCents).toBe(500);

    const again = await post(token, orderId, randomUUID(), { kind: 'remove_item', orderItemId: itemIds[0] });
    expect(again.status).toBe(404);
  });

  it('change_qty: recalcula do preço unitário congelado, delta contra o efetivo', async () => {
    const token = await staffToken();
    const { orderId, itemIds } = await createOrder('ready', [{ quantity: 2, unitBasePriceCents: 800 }]); // subtotal 1600

    const res = await post(token, orderId, randomUUID(), { kind: 'change_qty', orderItemId: itemIds[0], newQuantity: 5 });

    expect(res.status).toBe(201);
    expect(res.body.currentSubtotalCents).toBe(800 * 5); // 4000
    expect(res.body.currentTotalCents).toBe(4000);
  });

  it('pedido completed: 409, nada muda', async () => {
    const token = await staffToken();
    const { orderId } = await createOrder('completed', [{ quantity: 1, unitBasePriceCents: 800 }]);

    const res = await post(token, orderId, randomUUID(), { kind: 'add_item', productId, quantity: 1 });

    expect(res.status).toBe(409);
    const order = await migratorPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.currentSubtotalCents).toBeNull();
  });

  it('token de CLIENTE: 401 estrito (invariante staff-only), nunca aplica o ajuste', async () => {
    const token = await customerToken();
    const { orderId } = await createOrder('preparing', [{ quantity: 1, unitBasePriceCents: 800 }]);

    const res = await post(token, orderId, randomUUID(), { kind: 'add_item', productId, quantity: 1 });

    // Estrito, não [401,403,404]: o guard fixado em auth (5b30129) garante
    // InvalidTokenError → 401 uniforme pra QUALQUER rota staff-only, nunca
    // mais o 500 cru de Prisma que este teste pegou originalmente.
    expect(res.status).toBe(401);
    const order = await migratorPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.currentSubtotalCents).toBeNull(); // nada foi aplicado, seja qual for o código
  });

  it('Idempotency-Key repetida: mesmo resultado, não duplica o ajuste', async () => {
    const token = await staffToken();
    const { orderId } = await createOrder('received', [{ quantity: 1, unitBasePriceCents: 800 }]);
    const key = randomUUID();
    const body = { kind: 'add_item', productId, quantity: 2 };

    const first = await post(token, orderId, key, body);
    const second = await post(token, orderId, key, body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const count = await migratorPrisma.orderAdjustment.count({ where: { orderId, idempotencyKey: key } });
    expect(count).toBe(1);
    const order = await migratorPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.currentSubtotalCents).toBe(800 + 800 * 2); // só aplicou uma vez
  });

  it('orderItemId de outro pedido (mesmo tenant): 404', async () => {
    const token = await staffToken();
    const { orderId } = await createOrder('preparing', [{ quantity: 1, unitBasePriceCents: 800 }]);
    const other = await createOrder('preparing', [{ quantity: 1, unitBasePriceCents: 500 }]);

    const res = await post(token, orderId, randomUUID(), { kind: 'remove_item', orderItemId: other.itemIds[0] });

    expect(res.status).toBe(404);
  });

  it('pedido de OUTRA loja do mesmo tenant (storeId da URL não bate): 404', async () => {
    const token = await staffToken();
    const managerOtherStore = await migratorPrisma.customer.create({
      data: { tenantId, name: 'Cliente Outra Loja', phoneCiphertext: Buffer.alloc(1), phoneLookupHash: `x-${randomUUID()}`, phoneKeyVersion: 1 },
    });
    const orderOtherStore = await migratorPrisma.order.create({
      data: {
        tenantId,
        storeId: otherStoreId,
        customerId: managerOtherStore.id,
        status: 'preparing',
        paymentMethod: 'cash_on_delivery',
        fulfillmentType: 'pickup',
        customerVerified: true,
        subtotalCents: 800,
        deliveryFeeCents: 0,
        totalCents: 800,
      },
    });

    const res = await post(token, orderOtherStore.id, randomUUID(), { kind: 'add_item', productId, quantity: 1 });
    expect(res.status).toBe(404);
  });

  it('sem Idempotency-Key: 400', async () => {
    const token = await staffToken();
    const { orderId } = await createOrder('preparing', [{ quantity: 1, unitBasePriceCents: 800 }]);

    const res = await post(token, orderId, undefined, { kind: 'add_item', productId, quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('sem token: 401', async () => {
    const { orderId } = await createOrder('preparing', [{ quantity: 1, unitBasePriceCents: 800 }]);
    const res = await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/orders/${orderId}/adjustments`)
      .set('X-Tenant-Id', tenantId)
      .set('Idempotency-Key', randomUUID())
      .send({ kind: 'add_item', productId, quantity: 1 });
    expect(res.status).toBe(401);
  });
});
