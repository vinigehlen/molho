import { randomBytes } from 'node:crypto';
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

/**
 * e2e de verdade (Neon/Redis) — Épico 14.6. Mesmo desenho de
 * staff-provisioning.e2e.test.ts: canal de staff forçado pra 'email' só
 * nesta suíte, restaurado no afterAll.
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
const createdEmails: string[] = [];
const createdTenantIds: string[] = [];
const originalOtpChannelStaff = process.env.OTP_CHANNEL_STAFF;

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
    for (const tenantId of createdTenantIds) {
      await migratorPrisma.auditLog.deleteMany({ where: { tenantId } });
      await migratorPrisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    }
    for (const email of createdEmails) {
      await migratorPrisma.user.deleteMany({ where: { emailLookupHash: hashEmailForLookup(email) } });
    }
    await migratorPrisma.$disconnect();
  }
  if (typeof app !== 'undefined') await app.close();
}, 30_000);

async function seedSuperadmin(email: string): Promise<void> {
  const { ciphertext, keyVersion } = encryptEmail(email);
  const user = await migratorPrisma.user.create({
    data: { name: email, emailCiphertext: Buffer.from(ciphertext), emailLookupHash: hashEmailForLookup(email), emailKeyVersion: keyVersion },
  });
  await migratorPrisma.userRole.create({
    data: { userId: user.id, role: 'platform.superadmin', scopeType: 'platform', scopeId: null },
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

describe('POST /v1/admin/platform/tenants', () => {
  it('super-admin provisiona tenant novo; owner loga por OTP e chega dono da loja', async () => {
    const adminEmail = randomEmail('admin');
    const ownerEmail = randomEmail('owner');
    createdEmails.push(adminEmail, ownerEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);

    const restaurantName = `E2E Provisionamento ${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/v1/admin/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: restaurantName, plan: 'pro', ownerEmail, ownerName: 'Dona da Loja' })
      .expect(201);

    createdTenantIds.push(res.body.tenant.id as string);
    expect(res.body).toEqual({
      tenant: { id: expect.any(String), slug: expect.any(String), name: restaurantName },
      store: { id: expect.any(String), name: restaurantName },
      ownerUserId: expect.any(String),
      ownerCreated: true,
    });

    // Plano 'pro' entitlement nasce trial (immediate=false por default) —
    // confere que os módulos default do plano REALMENTE foram gravados, não
    // só o tenant/store.
    const entitlements = await migratorPrisma.tenantEntitlement.findMany({
      where: { tenantId: res.body.tenant.id as string },
    });
    expect(entitlements.length).toBeGreaterThan(0);
    expect(entitlements.every((e) => e.source === 'trial' && e.status === 'trialing')).toBe(true);

    // Fecha o ciclo: owner recém-criado loga pelo OTP normal e chega com o tenant.
    const ownerToken = await loginStaff(ownerEmail);
    const tenants = await request(app.getHttpServer())
      .get('/v1/me/sessions/tenants')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(tenants.body.tenants).toEqual([expect.objectContaining({ id: res.body.tenant.id, name: restaurantName })]);
  });

  it('immediate=true nasce sem trial: entitlement manual/active direto', async () => {
    const adminEmail = randomEmail('admin2');
    const ownerEmail = randomEmail('owner2');
    createdEmails.push(adminEmail, ownerEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);

    const res = await request(app.getHttpServer())
      .post('/v1/admin/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Imediato ${Date.now()}`, plan: 'standard', ownerEmail, ownerName: 'Dono', immediate: true })
      .expect(201);
    createdTenantIds.push(res.body.tenant.id as string);

    const entitlements = await migratorPrisma.tenantEntitlement.findMany({
      where: { tenantId: res.body.tenant.id as string },
    });
    expect(entitlements.length).toBeGreaterThan(0);
    expect(entitlements.every((e) => e.source === 'manual' && e.status === 'active')).toBe(true);
  });

  it('JWT sem platform.superadmin: 403', async () => {
    const plainEmail = randomEmail('plain');
    createdEmails.push(plainEmail);
    // Staff nasce SEM papel no primeiro login (CLAUDE.md regra 2) — precisa
    // de ALGUM papel (não-platform) pra sequer conseguir logar, senão o
    // 400 de "sem papel nenhum" (staff-auth.controller.ts) mascararia o 403
    // que este teste quer provar.
    const scopeTenant = await migratorPrisma.tenant.create({
      data: { slug: `e2e-plain-scope-${Date.now()}`, name: 'E2E Scope Tenant', timezone: 'America/Sao_Paulo' },
    });
    createdTenantIds.push(scopeTenant.id);
    const { ciphertext, keyVersion } = encryptEmail(plainEmail);
    const plainUser = await migratorPrisma.user.create({
      data: { name: plainEmail, emailCiphertext: Buffer.from(ciphertext), emailLookupHash: hashEmailForLookup(plainEmail), emailKeyVersion: keyVersion },
    });
    await migratorPrisma.userRole.create({
      data: { userId: plainUser.id, role: 'owner', scopeType: 'tenant', scopeId: scopeTenant.id },
    });
    const plainToken = await loginStaff(plainEmail);

    await request(app.getHttpServer())
      .post('/v1/admin/platform/tenants')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ name: 'Não Deveria Existir', plan: 'standard', ownerEmail: randomEmail('vitima'), ownerName: 'X' })
      .expect(403);
  });

  it('payload inválido (plan fora de PLANS): 400', async () => {
    const adminEmail = randomEmail('admin3');
    createdEmails.push(adminEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);

    await request(app.getHttpServer())
      .post('/v1/admin/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X', plan: 'enterprise', ownerEmail: randomEmail('x'), ownerName: 'X' })
      .expect(400);
  });
});
