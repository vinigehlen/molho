import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, encryptEmail, hashEmailForLookup } from '@molho/db';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Suíte mais pesada que as demais e2e da pasta (provisiona tenant COMPLETO
// via API antes de impersonar) — default de 5s do vitest é curto demais pra
// vários round-trips de OTP+DB em série.
vi.setConfig({ testTimeout: 20_000 });
import { AppModule } from '../app.module';
import { EMAIL_PROVIDER } from '../messaging/messaging.module';
import type { MockEmailProvider } from '../messaging/mock-email.provider';
import type { TokenPayload } from '../auth/token/token-payload';

/**
 * e2e de verdade (Neon/Redis) — Épico 14, "o recurso mais perigoso da
 * plataforma" (docs/01 §5-C.1). Prova, na integração real: token de
 * impersonation lê (readOnly), bloqueia escrita quando readOnly, permite
 * escrita quando explicitamente liberado, `sub` do JWT é o ATOR REAL (nunca
 * um ID sintético), grava audit_log, e tenta notificar o owner por e-mail.
 *
 * Usa o PRÓPRIO endpoint de provisionamento (Épico 14.6) pra montar um
 * tenant com módulo `coupons` entitled+enabled de verdade — testar
 * impersonation contra um tenant "cru" (criado direto no banco, sem
 * entitlement nenhum) provaria só o guard de módulo, não o de impersonation.
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
      await migratorPrisma.coupon.deleteMany({ where: { tenantId } });
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

async function provisionTenant(adminToken: string, ownerEmail: string): Promise<{ tenantId: string }> {
  const res = await request(app.getHttpServer())
    .post('/v1/admin/platform/tenants')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `E2E Impersonation ${Date.now()}`, plan: 'standard', ownerEmail, ownerName: 'Dona da Loja', immediate: true })
    .expect(201);
  const tenantId = res.body.tenant.id as string;
  createdTenantIds.push(tenantId);
  return { tenantId };
}

describe('POST /v1/admin/platform/tenants/:tenantId/impersonate', () => {
  it('readOnly (default): GET passa, POST é bloqueado — mas sub do JWT é o ATOR REAL', async () => {
    const adminEmail = randomEmail('admin');
    const ownerEmail = randomEmail('owner');
    createdEmails.push(adminEmail, ownerEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);
    const adminPayload = jwt.decode(adminToken) as TokenPayload;

    const { tenantId } = await provisionTenant(adminToken, ownerEmail);

    const start = await request(app.getHttpServer())
      .post(`/v1/admin/platform/tenants/${tenantId}/impersonate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Investigar bug relatado pelo lojista no WhatsApp.' })
      .expect(201);

    expect(start.body).toEqual({
      accessToken: expect.any(String),
      tenantId,
      tenantSlug: expect.any(String),
      tenantName: expect.any(String),
      readOnly: true,
      expiresAt: expect.any(String),
    });
    const expiresInMinutes = (new Date(start.body.expiresAt).getTime() - Date.now()) / 60_000;
    expect(expiresInMinutes).toBeGreaterThan(29);
    expect(expiresInMinutes).toBeLessThanOrEqual(30);

    // sub é o ID do ATOR REAL, nunca um ID sintético — é isso que faz toda
    // escrita durante impersonation gravar autoria verdadeira de graça.
    const impersonationPayload = jwt.decode(start.body.accessToken) as TokenPayload;
    expect(impersonationPayload.sub).toBe(adminPayload.sub);

    const impersonationToken = start.body.accessToken as string;

    await request(app.getHttpServer())
      .get('/v1/admin/coupons')
      .set('Authorization', `Bearer ${impersonationToken}`)
      .set('X-Tenant-Id', tenantId)
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/admin/coupons')
      .set('Authorization', `Bearer ${impersonationToken}`)
      .set('X-Tenant-Id', tenantId)
      .send({ code: 'BLOQUEADO', discountType: 'percent', discountPercent: 10, minOrderCents: 0, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(), maxUses: 10 })
      .expect(403);

    // audit_log do INÍCIO da impersonation — grava sempre, mesmo que o
    // e-mail de aviso falhe depois (best-effort separado).
    const auditRow = await migratorPrisma.auditLog.findFirst({
      where: { tenantId, action: 'platform.impersonation_start' },
    });
    expect(auditRow).toMatchObject({ actorId: adminPayload.sub, actorRole: 'platform.superadmin' });
    expect((auditRow?.afterJson as { readOnly: boolean })?.readOnly).toBe(true);

    // Best-effort: notifica o dono por e-mail.
    const mock = app.get<MockEmailProvider>(EMAIL_PROVIDER);
    const sentToOwner = mock.getSentEmails().find((e) => e.to === ownerEmail);
    expect(sentToOwner).toBeDefined();
  });

  it('readOnly=false com motivo detalhado: escrita passa de verdade', async () => {
    const adminEmail = randomEmail('admin2');
    const ownerEmail = randomEmail('owner2');
    createdEmails.push(adminEmail, ownerEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);

    const { tenantId } = await provisionTenant(adminToken, ownerEmail);

    const start = await request(app.getHttpServer())
      .post(`/v1/admin/platform/tenants/${tenantId}/impersonate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Corrigir cupom criado errado a pedido do lojista, confirmado por telefone.', readOnly: false })
      .expect(201);
    expect(start.body.readOnly).toBe(false);

    await request(app.getHttpServer())
      .post('/v1/admin/coupons')
      .set('Authorization', `Bearer ${start.body.accessToken}`)
      .set('X-Tenant-Id', tenantId)
      .send({ code: 'LIBERADO', discountType: 'percent', discountPercent: 10, minOrderCents: 0, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(), maxUses: 10 })
      .expect(201);

    const coupon = await migratorPrisma.coupon.findFirst({ where: { tenantId, code: 'LIBERADO' } });
    expect(coupon).not.toBeNull();
  });

  it('readOnly=false com motivo curto (<30 chars): 400 — escrita exige mais justificativa', async () => {
    const adminEmail = randomEmail('admin3');
    const ownerEmail = randomEmail('owner3');
    createdEmails.push(adminEmail, ownerEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);
    const { tenantId } = await provisionTenant(adminToken, ownerEmail);

    await request(app.getHttpServer())
      .post(`/v1/admin/platform/tenants/${tenantId}/impersonate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'motivo curto', readOnly: false })
      .expect(400);
  });

  it('tenant inexistente: 404', async () => {
    const adminEmail = randomEmail('admin4');
    createdEmails.push(adminEmail);
    await seedSuperadmin(adminEmail);
    const adminToken = await loginStaff(adminEmail);

    await request(app.getHttpServer())
      .post('/v1/admin/platform/tenants/00000000-0000-7000-8000-000000000000/impersonate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Motivo qualquer, só pra testar 404.' })
      .expect(404);
  });

  it('JWT sem platform.superadmin: 403', async () => {
    const plainEmail = randomEmail('plain');
    createdEmails.push(plainEmail);
    const scopeTenant = await migratorPrisma.tenant.create({
      data: { slug: `e2e-imp-scope-${Date.now()}`, name: 'E2E Scope Tenant', timezone: 'America/Sao_Paulo' },
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
      .post(`/v1/admin/platform/tenants/${scopeTenant.id}/impersonate`)
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ reason: 'Não deveria conseguir de jeito nenhum.' })
      .expect(403);
  });
});
