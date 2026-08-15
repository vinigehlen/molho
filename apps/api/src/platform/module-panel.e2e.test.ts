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
 * e2e de verdade (Neon/Redis) — Épico 14.4. Canal de staff forçado pra
 * 'email' só nesta suíte, mesmo racional/mesma restauração de
 * staff-provisioning.e2e.test.ts (StaffIdentityRepository cria User só por
 * e-mail — o restante do repo roda com o default 'sms').
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
let testTenantId: string;
const testTenantSlug = `e2e-module-panel-${Date.now()}`;
const createdEmails: string[] = [];
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
  const tenant = await migratorPrisma.tenant.create({
    data: { slug: testTenantSlug, name: 'E2E Module Panel Tenant', timezone: 'America/Sao_Paulo' },
  });
  testTenantId = tenant.id;
}, 30_000);

afterAll(async () => {
  if (originalOtpChannelStaff === undefined) delete process.env.OTP_CHANNEL_STAFF;
  else process.env.OTP_CHANNEL_STAFF = originalOtpChannelStaff;

  if (typeof migratorPrisma !== 'undefined') {
    // audit_log.actor_id e module_audit.actor_id são RESTRICT (regra 15 do
    // CLAUDE.md) — apagar o User antes deles estoura FK.
    const hashes = createdEmails.map(hashEmailForLookup);
    const actors = hashes.length
      ? await migratorPrisma.user.findMany({ where: { emailLookupHash: { in: hashes } }, select: { id: true } })
      : [];
    if (actors.length) {
      const actorIds = actors.map((u) => u.id);
      await migratorPrisma.auditLog.deleteMany({ where: { actorId: { in: actorIds } } });
      await migratorPrisma.moduleAudit.deleteMany({ where: { actorId: { in: actorIds } } });
    }
    if (typeof testTenantId === 'string') {
      await migratorPrisma.auditLog.deleteMany({ where: { tenantId: testTenantId } });
      await migratorPrisma.customer.deleteMany({ where: { tenantId: testTenantId } });
      // tenant_entitlements/module_audit têm onDelete: Cascade em tenant — vão junto.
      await migratorPrisma.tenant.delete({ where: { id: testTenantId } }).catch(() => {});
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

async function seedPlainStaff(email: string): Promise<void> {
  const { ciphertext, keyVersion } = encryptEmail(email);
  const user = await migratorPrisma.user.create({
    data: { name: email, emailCiphertext: Buffer.from(ciphertext), emailLookupHash: hashEmailForLookup(email), emailKeyVersion: keyVersion },
  });
  await migratorPrisma.userRole.create({
    data: { userId: user.id, role: 'owner', scopeType: 'tenant', scopeId: testTenantId },
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

async function adminToken(): Promise<string> {
  const email = randomEmail('admin');
  createdEmails.push(email);
  await seedSuperadmin(email);
  return loginStaff(email);
}

function moduleOf(list: { moduleKey: string }[], moduleKey: string) {
  const found = list.find((m) => m.moduleKey === moduleKey);
  if (!found) throw new Error(`módulo "${moduleKey}" não apareceu na lista`);
  return found;
}

describe('painel de módulos do super-admin', () => {
  it('concede módulo sem dependência → GET mostra entitled:true', async () => {
    const token = await adminToken();

    await request(app.getHttpServer())
      .put(`/v1/admin/platform/tenants/${testTenantId}/entitlements/coupons`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`/v1/admin/platform/tenants/${testTenantId}/modules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const coupons = moduleOf(list.body.modules, 'coupons');
    expect(coupons).toMatchObject({ entitled: true, status: 'active', source: 'manual' });
    expect(list.body.modules.some((m: { moduleKey: string }) => m.moduleKey === 'catalog')).toBe(false); // core não entra
  }, 15_000);

  it('conceder com requires faltando → 409 listando o que falta', async () => {
    const token = await adminToken();

    // channel.qrcode_table requires ['tables'] — 'tables' nunca foi entitled neste tenant.
    const res = await request(app.getHttpServer())
      .put(`/v1/admin/platform/tenants/${testTenantId}/entitlements/channel.qrcode_table`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' })
      .expect(409);

    expect(res.body.missing).toEqual(['tables']);
  });

  it('revoke → status revoked, active false (mesmo se estava active)', async () => {
    const token = await adminToken();
    await request(app.getHttpServer())
      .put(`/v1/admin/platform/tenants/${testTenantId}/entitlements/promotions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' })
      .expect(200);

    const revoked = await request(app.getHttpServer())
      .put(`/v1/admin/platform/tenants/${testTenantId}/entitlements/promotions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'revoked' })
      .expect(200);

    expect(revoked.body).toMatchObject({ status: 'revoked', entitled: false, active: false });
  });

  it('módulo core → 400', async () => {
    const token = await adminToken();

    await request(app.getHttpServer())
      .put(`/v1/admin/platform/tenants/${testTenantId}/entitlements/catalog`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' })
      .expect(400);
  });

  it('moduleKey inválido → 400', async () => {
    const token = await adminToken();

    await request(app.getHttpServer())
      .put(`/v1/admin/platform/tenants/${testTenantId}/entitlements/nao-existe`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' })
      .expect(400);
  });

  it('sem platform.superadmin → 403', async () => {
    const email = randomEmail('plain');
    createdEmails.push(email);
    await seedPlainStaff(email);
    const token = await loginStaff(email);

    await request(app.getHttpServer())
      .get(`/v1/admin/platform/tenants/${testTenantId}/modules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
