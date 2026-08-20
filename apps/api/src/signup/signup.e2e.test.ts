import { randomBytes } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { EMAIL_PROVIDER } from '../messaging/messaging.module';
import type { MockEmailProvider } from '../messaging/mock-email.provider';

function randomEmail(): string {
  return `signup-${Date.now()}-${randomBytes(3).toString('hex')}@example.test`;
}

function extractCode(message: string): string {
  const match = message.match(/\d{6}/);
  if (!match) throw new Error(`sem código de 6 dígitos em "${message}"`);
  return match[0];
}

async function latestCode(emailProvider: MockEmailProvider, email: string): Promise<string> {
  const sent = emailProvider.getSentEmails().filter((item) => item.to === email);
  const last = sent.at(-1);
  if (!last) throw new Error(`sem e-mail enviado para ${email}`);
  return extractCode(last.text);
}

let app: INestApplication;
let prisma: PrismaClient;
let redis: Redis;
let emailProvider: MockEmailProvider;
const tenantIds: string[] = [];
const userEmails: string[] = [];

beforeAll(async () => {
  redis = new Redis(process.env.REDIS_URL as string);
  const keys = await redis.keys('signup:*');
  if (keys.length) await redis.del(...keys);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  emailProvider = app.get(EMAIL_PROVIDER) as MockEmailProvider;
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
}, 30_000);

afterAll(async () => {
  delete process.env.MOLHO_SIGNUP_FORCE_ROLLBACK_EMAIL;
  for (const id of tenantIds) {
    await prisma.tenant.delete({ where: { id } }).catch(() => {});
  }
  for (const email of userEmails) {
    const user = await prisma.user.findFirst({ where: { name: email } });
    if (user) await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
  await prisma.$disconnect();
  const keys = await redis.keys('signup:*');
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
  await app.close();
}, 30_000);

beforeEach(async () => {
  const ipKeys = await redis.keys('signup:rl:ip:*');
  if (ipKeys.length) await redis.del(...ipKeys);
});

async function requestAndVerify(email: string, restaurantName = `Restaurante ${randomBytes(2).toString('hex')}`) {
  await request(app.getHttpServer()).post('/v1/signup/request-otp').send({ email }).expect(202);
  const code = await latestCode(emailProvider, email);
  const res = await request(app.getHttpServer())
    .post('/v1/signup/verify')
    .send({ email, code, restaurantName, ownerName: email })
    .expect(200);
  tenantIds.push(res.body.tenant.id);
  userEmails.push(email);
  return res;
}

describe('POST /v1/signup', () => {
  it('signup feliz cria tenant, store, owner, entitlements, cardápio-exemplo e devolve sessão staff', async () => {
    const email = randomEmail();
    const res = await requestAndVerify(email, 'Casa do Signup');
    expect(res.body.accessToken).toEqual(expect.any(String));
    const setCookie = res.headers['set-cookie'];
    expect(Array.isArray(setCookie) ? setCookie.join(';') : setCookie).toContain('__Host-molho_refresh=');

    const tenant = await prisma.tenant.findUnique({ where: { id: res.body.tenant.id } });
    expect(tenant?.planId).toBe('standard');
    const [stores, roles, entitlements, products] = await Promise.all([
      prisma.store.count({ where: { tenantId: res.body.tenant.id } }),
      prisma.userRole.count({ where: { role: 'owner', scopeType: 'tenant', scopeId: res.body.tenant.id } }),
      prisma.tenantEntitlement.count({ where: { tenantId: res.body.tenant.id, source: 'trial', status: 'trialing' } }),
      prisma.product.count({ where: { tenantId: res.body.tenant.id } }),
    ]);
    expect(stores).toBe(1);
    expect(roles).toBe(1);
    expect(entitlements).toBeGreaterThan(0);
    expect(products).toBe(3);
  });

  it('request-otp não cria tenant nem user', async () => {
    const email = randomEmail();
    await request(app.getHttpServer()).post('/v1/signup/request-otp').send({ email }).expect(202);
    expect(await prisma.tenant.count({ where: { name: { contains: email } } })).toBe(0);
    expect(await prisma.user.count({ where: { name: email } })).toBe(0);
  });

  it('OTP errado retorna 401 e não provisiona nada', async () => {
    const email = randomEmail();
    await request(app.getHttpServer()).post('/v1/signup/request-otp').send({ email }).expect(202);
    await request(app.getHttpServer())
      .post('/v1/signup/verify')
      .send({ email, code: '000000', restaurantName: 'Falha OTP', ownerName: email })
      .expect(401);
    expect(await prisma.tenant.count({ where: { name: 'Falha OTP' } })).toBe(0);
    expect(await prisma.user.count({ where: { name: email } })).toBe(0);
  });

  it('signup duplo do mesmo e-mail retorna o tenant existente', async () => {
    const email = randomEmail();
    const first = await requestAndVerify(email, 'Loja Idempotente');
    await request(app.getHttpServer()).post('/v1/signup/request-otp').send({ email }).expect(202);
    const code = await latestCode(emailProvider, email);
    const second = await request(app.getHttpServer())
      .post('/v1/signup/verify')
      .send({ email, code, restaurantName: 'Loja Idempotente 2', ownerName: email })
      .expect(200);
    expect(second.body.created).toBe(false);
    expect(second.body.tenant.id).toBe(first.body.tenant.id);
    expect(await prisma.userRole.count({ where: { userId: second.body.user.id, role: 'owner' } })).toBe(1);
  });

  it('rate-limit estoura no cap conservador por IP', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer()).post('/v1/signup/request-otp').send({ email: randomEmail() }).expect(202);
    }
    await request(app.getHttpServer()).post('/v1/signup/request-otp').send({ email: randomEmail() }).expect(429);
  });

  it('rate-limit estoura no cap conservador por e-mail', async () => {
    const email = randomEmail();
    const emailKeys = await redis.keys('signup:rl:email:*');
    if (emailKeys.length) await redis.del(...emailKeys);
    for (let i = 0; i < 5; i += 1) {
      const ipKeys = await redis.keys('signup:rl:ip:*');
      if (ipKeys.length) await redis.del(...ipKeys);
      await request(app.getHttpServer()).post('/v1/signup/request-otp').send({ email }).expect(202);
    }
    const ipKeys = await redis.keys('signup:rl:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);
    await request(app.getHttpServer()).post('/v1/signup/request-otp').send({ email }).expect(429);
  });

  it('rollback remove todos os resquícios se falhar no meio do provisionamento', async () => {
    const email = randomEmail();
    process.env.MOLHO_SIGNUP_FORCE_ROLLBACK_EMAIL = email;
    await request(app.getHttpServer()).post('/v1/signup/request-otp').send({ email }).expect(202);
    const code = await latestCode(emailProvider, email);
    await request(app.getHttpServer())
      .post('/v1/signup/verify')
      .send({ email, code, restaurantName: 'Rollback Total', ownerName: email })
      .expect(500);
    expect(await prisma.tenant.count({ where: { name: 'Rollback Total' } })).toBe(0);
    expect(await prisma.store.count({ where: { name: 'Rollback Total' } })).toBe(0);
    expect(await prisma.user.count({ where: { name: email } })).toBe(0);
  });
});
