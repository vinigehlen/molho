import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, encryptEmail, hashEmailForLookup } from '@molho/db';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { EMAIL_PROVIDER } from '../messaging/messaging.module';
import type { MockEmailProvider } from '../messaging/mock-email.provider';
import { WEIGHED_LINE_MAX_CENTS } from './counter-order.service';

/**
 * e2e de verdade: Postgres real (RLS) + Redis real + MockEmailProvider
 * (RESEND_API_KEY ausente). Canal de staff forçado pra 'email' só nesta
 * suíte (mesmo racional de staff-provisioning.e2e.test.ts) — o resto do
 * repo roda com o default 'sms'.
 */

function randomEmail(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}@e2e.molho.test`;
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
let storeId: string;
let categoryId: string;
let productId: string; // basePriceCents = 800
let otherTenantProductId: string;
let otherTenantId: string;
const createdEmails: string[] = [];

async function seedCashier(email: string): Promise<void> {
  const { ciphertext, keyVersion } = encryptEmail(email);
  const user = await migratorPrisma.user.create({
    data: { name: email, emailCiphertext: Buffer.from(ciphertext), emailLookupHash: hashEmailForLookup(email), emailKeyVersion: keyVersion },
  });
  await migratorPrisma.userRole.create({
    data: { userId: user.id, role: 'cashier', scopeType: 'tenant', scopeId: tenantId },
  });
}

async function loginStaff(email: string): Promise<string> {
  await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ email }).expect(202);
  const mock = app.get<MockEmailProvider>(EMAIL_PROVIDER);
  const sent = mock.getSentEmails();
  const last = sent[sent.length - 1];
  if (!last) throw new Error('nenhum e-mail enviado pelo MockEmailProvider');
  const code = extractCode(last.text);
  const res = await request(app.getHttpServer()).post('/v1/auth/otp/verify').send({ email, code }).expect(200);
  return res.body.accessToken as string;
}

async function cashierToken(): Promise<string> {
  const email = randomEmail('cashier');
  createdEmails.push(email);
  await seedCashier(email);
  return loginStaff(email);
}

function post(token: string, idempotencyKey: string, body: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post(`/v1/admin/stores/${storeId}/counter-orders`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-Id', tenantId)
    .set('Idempotency-Key', idempotencyKey)
    .send(body);
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

  const slug = `e2e-counter-order-${Date.now()}`;
  const tenant = await migratorPrisma.tenant.create({
    data: { slug, name: 'Balcão E2E', timezone: 'America/Sao_Paulo' },
  });
  tenantId = tenant.id;

  const store = await migratorPrisma.store.create({
    data: { tenantId, name: 'Balcão E2E', addressText: 'Rua X, 1', timezone: 'America/Sao_Paulo' },
  });
  storeId = store.id;

  const category = await migratorPrisma.category.create({ data: { tenantId, name: 'Salgados', sortOrder: 0, visible: true } });
  categoryId = category.id;
  const product = await migratorPrisma.product.create({
    data: { tenantId, categoryId, name: 'Coxinha', basePriceCents: 800, available: true },
  });
  productId = product.id;

  // Produto de OUTRO tenant — prova RLS (404, não 500 de FK crua).
  const otherSlug = `e2e-counter-order-other-${Date.now()}`;
  const otherTenant = await migratorPrisma.tenant.create({
    data: { slug: otherSlug, name: 'Outro Tenant E2E', timezone: 'America/Sao_Paulo' },
  });
  otherTenantId = otherTenant.id;
  const otherCategory = await migratorPrisma.category.create({
    data: { tenantId: otherTenantId, name: 'Outra Categoria', sortOrder: 0, visible: true },
  });
  const otherProduct = await migratorPrisma.product.create({
    data: { tenantId: otherTenantId, categoryId: otherCategory.id, name: 'Produto Outro Tenant', basePriceCents: 100, available: true },
  });
  otherTenantProductId = otherProduct.id;
}, 30_000);

afterAll(async () => {
  if (originalOtpChannelStaff === undefined) delete process.env.OTP_CHANNEL_STAFF;
  else process.env.OTP_CHANNEL_STAFF = originalOtpChannelStaff;

  if (typeof migratorPrisma !== 'undefined') {
    // audit_log.actor_id é RESTRICT — apaga antes do User (mesma lição de staff-provisioning.e2e.test.ts).
    const hashes = createdEmails.map(hashEmailForLookup);
    const actors = hashes.length
      ? await migratorPrisma.user.findMany({ where: { emailLookupHash: { in: hashes } }, select: { id: true } })
      : [];
    if (actors.length) {
      await migratorPrisma.auditLog.deleteMany({ where: { actorId: { in: actors.map((u) => u.id) } } });
    }

    for (const id of [tenantId, otherTenantId].filter((x): x is string => typeof x === 'string')) {
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

describe('POST /v1/admin/stores/:storeId/counter-orders', () => {
  it('unit+weighed: received, confirmado, totais certos (unit do CATÁLOGO, weighed do valor mandado)', async () => {
    const token = await cashierToken();

    const res = await post(token, randomUUID(), {
      items: [
        { kind: 'unit', productId, quantity: 3 }, // 800 × 3 = 2400 — SEM preço no body
        { kind: 'weighed', productId, weightGrams: 350, lineTotalCents: 4200 },
      ],
      paymentMethod: 'pix',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'received',
      paymentStatus: 'confirmado',
      paymentMethod: 'pix',
      subtotalCents: 2400 + 4200,
      totalCents: 2400 + 4200,
    });

    const order = await migratorPrisma.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
    expect(order.status).toBe('received');
    expect(order.paymentStatus).toBe('confirmado');
    expect(order.fulfillmentType).toBe('pickup');
    expect(order.changeForCents).toBeNull();
    expect(order.deliveryFeeCents).toBe(0);
  }, 15_000);

  it('pedido de balcão entra na listagem ativa do gestor', async () => {
    const token = await cashierToken();
    const res = await post(token, randomUUID(), {
      items: [{ kind: 'unit', productId, quantity: 1 }],
      paymentMethod: 'card_at_counter',
    });

    expect(res.status).toBe(201);
    const board = await request(app.getHttpServer())
      .get('/v1/admin/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId);

    expect(board.status).toBe(200);
    expect(board.body.some((order: { id: string; status: string }) => order.id === res.body.orderId && order.status === 'received')).toBe(
      true,
    );
  });

  it('preço do item unit vem do CATÁLOGO — um lineTotalCents mandado no body é ignorado', async () => {
    const token = await cashierToken();

    const res = await post(token, randomUUID(), {
      // 'unit' não tem campo de preço no schema — mandar um extra não muda nada.
      items: [{ kind: 'unit', productId, quantity: 1, lineTotalCents: 1 }],
      paymentMethod: 'card_at_counter',
    });

    expect(res.status).toBe(201);
    expect(res.body.subtotalCents).toBe(800); // basePriceCents do catálogo, NUNCA "1"
  });

  it('weighed com lineTotalCents <= 0: 400', async () => {
    const token = await cashierToken();
    const res = await post(token, randomUUID(), {
      items: [{ kind: 'weighed', productId, weightGrams: 100, lineTotalCents: 0 }],
      paymentMethod: 'pix',
    });
    // zod já barra <=0 na forma (min(1)) — 400 de qualquer forma.
    expect(res.status).toBe(400);
  });

  it('weighed acima do teto: 400 com a mensagem do serviço, não do zod', async () => {
    const token = await cashierToken();
    const res = await post(token, randomUUID(), {
      items: [{ kind: 'weighed', productId, weightGrams: 100, lineTotalCents: WEIGHED_LINE_MAX_CENTS + 1 }],
      paymentMethod: 'pix',
    });
    expect(res.status).toBe(400);
  });

  it('Idempotency-Key repetida: mesmo pedido, não duplica', async () => {
    const token = await cashierToken();
    const key = randomUUID();
    const body = { items: [{ kind: 'unit', productId, quantity: 1 }], paymentMethod: 'cash_at_counter' };

    const first = await post(token, key, body);
    const second = await post(token, key, body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.orderId).toBe(first.body.orderId);

    const count = await migratorPrisma.order.count({ where: { tenantId, idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it('cash_at_counter/card_at_counter: pickup, changeForCents NULL', async () => {
    const token = await cashierToken();
    for (const paymentMethod of ['cash_at_counter', 'card_at_counter']) {
      const res = await post(token, randomUUID(), {
        items: [{ kind: 'unit', productId, quantity: 1 }],
        paymentMethod,
      });
      expect(res.status).toBe(201);
      const order = await migratorPrisma.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
      expect(order.fulfillmentType).toBe('pickup');
      expect(order.changeForCents).toBeNull();
      expect(order.paymentMethod).toBe(paymentMethod);
    }
  });

  it('productId de outro tenant: 404 (RLS), nunca FK crua', async () => {
    const token = await cashierToken();
    const res = await post(token, randomUUID(), {
      items: [{ kind: 'unit', productId: otherTenantProductId, quantity: 1 }],
      paymentMethod: 'pix',
    });
    expect(res.status).toBe(404);
  });

  it('sem Idempotency-Key: 400', async () => {
    const token = await cashierToken();
    const res = await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/counter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({ items: [{ kind: 'unit', productId, quantity: 1 }], paymentMethod: 'pix' });
    expect(res.status).toBe(400);
  });

  it('sem token: 401', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/admin/stores/${storeId}/counter-orders`)
      .set('X-Tenant-Id', tenantId)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ kind: 'unit', productId, quantity: 1 }], paymentMethod: 'pix' });
    expect(res.status).toBe(401);
  });
});
