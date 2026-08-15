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

/**
 * e2e de verdade: Redis + Postgres reais, MockEmailProvider (RESEND_API_KEY
 * ausente no .env.local). Fecha o ciclo do Épico 14.3: super-admin provisiona
 * → staff loga pelo OTP normal e chega com o papel no token.
 *
 * Canal de staff é forçado pra 'email' SÓ NESTA suíte (o resto do repo roda
 * com o default 'sms' — ver otp-channel.ts) porque StaffProvisioningRepository
 * cria o User só por e-mail (mesma chave de identidade de staff-identity.
 * repository.ts). Restaurado no afterAll pra não vazar pros outros arquivos
 * e2e da mesma execução (test:e2e roda --no-file-parallelism, mas no mesmo
 * processo).
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
const testTenantSlug = `e2e-staff-prov-${Date.now()}`;
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
    data: { slug: testTenantSlug, name: 'E2E Staff Provisioning Tenant', timezone: 'America/Sao_Paulo' },
  });
  testTenantId = tenant.id;
}, 30_000);

afterAll(async () => {
  if (originalOtpChannelStaff === undefined) delete process.env.OTP_CHANNEL_STAFF;
  else process.env.OTP_CHANNEL_STAFF = originalOtpChannelStaff;

  if (typeof migratorPrisma !== 'undefined') {
    // audit_log.actor_id é RESTRICT (nunca perde o rastro de quem fez o quê,
    // regra 15 do CLAUDE.md) — apagar o User de teste sem apagar o audit_log
    // dele primeiro estoura FK, não é opcional aqui.
    const hashes = createdEmails.map(hashEmailForLookup);
    const actors = hashes.length
      ? await migratorPrisma.user.findMany({ where: { emailLookupHash: { in: hashes } }, select: { id: true } })
      : [];
    if (actors.length) {
      await migratorPrisma.auditLog.deleteMany({ where: { actorId: { in: actors.map((u) => u.id) } } });
    }
    if (typeof testTenantId === 'string') {
      await migratorPrisma.auditLog.deleteMany({ where: { tenantId: testTenantId } });
      await migratorPrisma.customer.deleteMany({ where: { tenantId: testTenantId } });
      await migratorPrisma.tenant.delete({ where: { id: testTenantId } }).catch(() => {});
    }
    for (const email of createdEmails) {
      // user_roles.user_id tem onDelete: Cascade — apagar o User já leva o papel junto.
      await migratorPrisma.user.deleteMany({ where: { emailLookupHash: hashEmailForLookup(email) } });
    }
    await migratorPrisma.$disconnect();
  }
  if (typeof app !== 'undefined') await app.close();
}, 30_000);

/** Bootstrap direto no banco — mesmo papel que packages/db/prisma/seed/superadmin.ts concede, sem passar pelo endpoint (que é justamente o que testamos). */
async function seedSuperadmin(email: string): Promise<void> {
  const { ciphertext, keyVersion } = encryptEmail(email);
  const user = await migratorPrisma.user.create({
    data: { name: email, emailCiphertext: Buffer.from(ciphertext), emailLookupHash: hashEmailForLookup(email), emailKeyVersion: keyVersion },
  });
  await migratorPrisma.userRole.create({
    data: { userId: user.id, role: 'platform.superadmin', scopeType: 'platform', scopeId: null },
  });
}

/** Staff comum, SEM nenhum papel — pra provar que o guard barra por falta de platform.superadmin, não por falta de conta. */
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

describe('POST /v1/admin/platform/staff', () => {
  it('super-admin provisiona owner; owner loga por OTP com o papel; segunda chamada é idempotente', async () => {
    const adminEmail = randomEmail('admin');
    const ownerEmail = randomEmail('owner');
    createdEmails.push(adminEmail, ownerEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);

    const payload = { email: ownerEmail, role: 'owner', scopeType: 'tenant', scopeId: testTenantId };

    const first = await request(app.getHttpServer())
      .post('/v1/admin/platform/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(first.body).toEqual({ userId: expect.any(String), role: 'owner', scopeType: 'tenant', scopeId: testTenantId, created: true });

    const second = await request(app.getHttpServer())
      .post('/v1/admin/platform/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(second.body).toEqual({ ...first.body, created: false });

    const roleCount = await migratorPrisma.userRole.count({
      where: { userId: first.body.userId as string, role: 'owner', scopeType: 'tenant', scopeId: testTenantId },
    });
    expect(roleCount).toBe(1); // idempotente de verdade: 2 chamadas, 1 linha

    // Fecha o ciclo: owner recém-provisionado loga pelo OTP normal e chega
    // com o papel — /v1/me/sessions/tenants deriva o tenant do JWT verificado.
    const ownerToken = await loginStaff(ownerEmail);
    const tenants = await request(app.getHttpServer())
      .get('/v1/me/sessions/tenants')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(tenants.body.tenants).toEqual([expect.objectContaining({ id: testTenantId, name: 'E2E Staff Provisioning Tenant' })]);
  });

  it('JWT sem platform.superadmin: 403 (PlatformContextGuard barra antes de tocar no banco de destino)', async () => {
    const plainEmail = randomEmail('plain');
    createdEmails.push(plainEmail);
    await seedPlainStaff(plainEmail);
    const plainToken = await loginStaff(plainEmail);

    await request(app.getHttpServer())
      .post('/v1/admin/platform/staff')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ email: randomEmail('vitima'), role: 'owner', scopeType: 'tenant', scopeId: testTenantId })
      .expect(403);
  });

  it('sem token: 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/admin/platform/staff')
      .send({ email: randomEmail('semtoken'), role: 'owner', scopeType: 'tenant', scopeId: testTenantId })
      .expect(401);
  });

  it('scopeId inexistente: 404 limpo, nunca FK crua', async () => {
    const adminEmail = randomEmail('admin2');
    createdEmails.push(adminEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);

    await request(app.getHttpServer())
      .post('/v1/admin/platform/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: randomEmail('orfao'), role: 'owner', scopeType: 'tenant', scopeId: randomUUID() })
      .expect(404);
  });

  it('payload inválido (role fora de ROLES): 400', async () => {
    const adminEmail = randomEmail('admin3');
    createdEmails.push(adminEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);

    await request(app.getHttpServer())
      .post('/v1/admin/platform/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: randomEmail('invalido'), role: 'ceo', scopeType: 'tenant', scopeId: testTenantId })
      .expect(400);
  });
});
