import { randomBytes } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { MESSAGING_PROVIDER } from '../messaging/messaging.module';
import type { MockMessagingProvider } from '../messaging/mock-messaging.provider';

/**
 * e2e de /v1/me/sessions — mesmo padrão de auth.e2e.test.ts (Redis + Postgres
 * reais, MockMessagingProvider). Cada login novo do MESMO telefone precisa
 * esperar o cooldown real de 60s do OTP, então este arquivo é lento de
 * propósito — faz parte de test:e2e, não do pnpm test default.
 */

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
// Ver nota em auth.e2e.test.ts: nullable desde a identidade por e-mail, e o
// `continue` no cleanup evita apagar TODO staff por e-mail do staging.
const createdUserPhoneHashes: (string | null)[] = [];

beforeAll(async () => {
  const redisCleanup = new Redis(process.env.REDIS_URL as string);
  const ipKeys = await redisCleanup.keys('otp_rl:ip:*');
  if (ipKeys.length) await redisCleanup.del(...ipKeys);
  redisCleanup.disconnect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  migratorPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
});

afterAll(async () => {
  for (const hash of createdUserPhoneHashes) {
    if (!hash) continue;
    await migratorPrisma.user.deleteMany({ where: { phoneLookupHash: hash } });
  }
  await migratorPrisma.$disconnect();
  await app.close();
});

async function getLastSentCode(): Promise<string> {
  const mock = app.get<MockMessagingProvider>(MESSAGING_PROVIDER);
  const sent = mock.getSentMessages();
  const last = sent[sent.length - 1];
  if (!last) throw new Error('nenhuma mensagem enviada pelo MockMessagingProvider');
  return extractCode(last.message);
}

async function loginStaff(phone: string, userAgent: string): Promise<{ accessToken: string; userId: string }> {
  await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
  const code = await getLastSentCode();
  const res = await request(app.getHttpServer())
    .post('/v1/auth/otp/verify')
    .set('User-Agent', userAgent)
    .send({ phone, code })
    .expect(200);
  return { accessToken: res.body.accessToken as string, userId: res.body.user.id as string };
}

describe('/v1/me/sessions', () => {
  it('lista, revoga um, revoga os outros e revoga tudo — fluxo completo com 2 dispositivos', async () => {
    const phone = randomPhone();

    const { accessToken: tokenDeviceA, userId } = await loginStaff(phone, 'device-A/1.0');
    createdUserPhoneHashes.push(
      (await migratorPrisma.user.findUniqueOrThrow({ where: { id: userId } })).phoneLookupHash,
    );

    // 2º login do mesmo telefone precisa esperar o cooldown real de 60s.
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    const { accessToken: tokenDeviceB } = await loginStaff(phone, 'device-B/1.0');

    const listRes = await request(app.getHttpServer())
      .get('/v1/me/sessions')
      .set('Authorization', `Bearer ${tokenDeviceA}`)
      .expect(200);
    expect(listRes.body.devices).toHaveLength(2);
    const current = listRes.body.devices.find((d: { isCurrent: boolean }) => d.isCurrent);
    expect(current).toBeTruthy();
    expect(listRes.body.devices.filter((d: { isCurrent: boolean }) => !d.isCurrent)).toHaveLength(1);

    // revoga só os outros (a partir do dispositivo A) — B cai, A continua.
    await request(app.getHttpServer())
      .delete('/v1/me/sessions/others')
      .set('Authorization', `Bearer ${tokenDeviceA}`)
      .expect(204);

    const afterOthersRes = await request(app.getHttpServer())
      .get('/v1/me/sessions')
      .set('Authorization', `Bearer ${tokenDeviceA}`)
      .expect(200);
    expect(afterOthersRes.body.devices).toHaveLength(1);
    expect(afterOthersRes.body.devices[0].isCurrent).toBe(true);

    // tokenDeviceB não teve token_version incrementado (revoke seletivo, não
    // revokeAll) — o access token dele continua válido até expirar sozinho,
    // só o refresh dele é que já não existe mais no Redis.
    await request(app.getHttpServer())
      .get('/v1/me/sessions')
      .set('Authorization', `Bearer ${tokenDeviceB}`)
      .expect(200);

    // revoga tudo — sobe token_version, invalida o cache na hora: o PRÓPRIO
    // token usado pra chamar isto também vira 401 na consulta seguinte.
    await request(app.getHttpServer())
      .delete('/v1/me/sessions/all')
      .set('Authorization', `Bearer ${tokenDeviceA}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/v1/me/sessions')
      .set('Authorization', `Bearer ${tokenDeviceA}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/v1/me/sessions')
      .set('Authorization', `Bearer ${tokenDeviceB}`)
      .expect(401);
  }, 90_000);

  it('sem Authorization: 401', async () => {
    await request(app.getHttpServer()).get('/v1/me/sessions').expect(401);
  });

  it('Authorization com token quebrado: 401', async () => {
    await request(app.getHttpServer())
      .get('/v1/me/sessions')
      .set('Authorization', 'Bearer token-invalido-de-verdade')
      .expect(401);
  });

  it('revoga um deviceId específico que não é o seu: 204 idempotente (não existe -> nada a fazer)', async () => {
    const phone = randomPhone();
    const { accessToken: token, userId } = await loginStaff(phone, 'device-solo/1.0');
    createdUserPhoneHashes.push(
      (await migratorPrisma.user.findUniqueOrThrow({ where: { id: userId } })).phoneLookupHash,
    );

    await request(app.getHttpServer())
      .delete('/v1/me/sessions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });
});
