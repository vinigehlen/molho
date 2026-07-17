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
 * e2e de verdade: Redis real (REDIS_URL de .env.local) + Postgres real +
 * MockMessagingProvider (ZENVIA_API_KEY ausente no .env.local — nunca bate
 * na Zenvia de verdade). Cada teste usa telefone aleatório pra não colidir
 * com rate limit/cooldown de outros testes rodando contra o MESMO Redis.
 *
 * O rate limit de IP (20/hora) É COMPARTILHADO entre execuções desta suíte
 * (e com qualquer teste manual via curl/Postman) porque todos rodam do
 * mesmo localhost — sem limpar, rodar a suíte 2x seguidas na mesma hora
 * autoderruba os próprios testes com 429. beforeAll limpa as chaves
 * otp_rl:ip:* antes de rodar, pra suíte ser re-executável de verdade.
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
let testTenantId: string;
const testTenantSlug = `e2e-test-${Date.now()}`;
const createdUserPhoneHashes: string[] = [];
// Tenants extras criados NO MEIO de um teste (não o principal do
// beforeAll/afterAll) — registrados aqui, não limpos inline no corpo do
// teste, pra sobreviver a uma falha/timeout no meio do caminho e não
// virar lixo órfão no Postgres (já aconteceu: achado rodando de verdade).
const extraTenantIds: string[] = [];

beforeAll(async () => {
  // Limpa rate-limit de IP acumulado de execuções anteriores (ou teste
  // manual via curl) — todos batem do mesmo localhost.
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
    data: { slug: testTenantSlug, name: 'E2E Test Tenant', timezone: 'America/Sao_Paulo' },
  });
  testTenantId = tenant.id;
});

afterAll(async () => {
  for (const id of [testTenantId, ...extraTenantIds]) {
    await migratorPrisma.customer.deleteMany({ where: { tenantId: id } });
    await migratorPrisma.tenant.delete({ where: { id } }).catch(() => {}); // já pode ter sido apagado
  }
  for (const hash of createdUserPhoneHashes) {
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

describe('POST /v1/auth/otp (staff)', () => {
  it('1º login (telefone novo): cria user, devolve accessToken/refreshToken/user', async () => {
    const phone = randomPhone();

    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = await getLastSentCode();

    const res = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.id).toBeTruthy();

    const created = await migratorPrisma.user.findUnique({ where: { id: res.body.user.id } });
    expect(created).not.toBeNull();
    createdUserPhoneHashes.push(created!.phoneLookupHash);
  });

  it('2º login do MESMO telefone: não duplica, devolve o mesmo user', async () => {
    const phone = randomPhone();

    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code1 = await getLastSentCode();
    const first = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code: code1 })
      .expect(200);
    createdUserPhoneHashes.push(
      (await migratorPrisma.user.findUniqueOrThrow({ where: { id: first.body.user.id } })).phoneLookupHash,
    );

    // 2º login precisa esperar o cooldown de 60s pra pedir outro OTP —
    // aqui simulamos direto pelo challenge store não seria e2e de verdade,
    // então o teste espera o cooldown real (é rápido o bastante pro CI).
    await new Promise((resolve) => setTimeout(resolve, 61_000));

    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code2 = await getLastSentCode();
    const second = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code: code2 })
      .expect(200);

    expect(second.body.user.id).toBe(first.body.user.id);

    const count = await migratorPrisma.user.count({ where: { phoneLookupHash: (await migratorPrisma.user.findUniqueOrThrow({ where: { id: first.body.user.id } })).phoneLookupHash } });
    expect(count).toBe(1);
  }, 70_000);

  it('verify errado 3x seguidas: 3ª falha com invalid, 4ª (mesmo com código certo) também falha', async () => {
    const phone = randomPhone();
    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = await getLastSentCode();

    await request(app.getHttpServer()).post('/v1/auth/otp/verify').send({ phone, code: '000000' }).expect(400);
    await request(app.getHttpServer()).post('/v1/auth/otp/verify').send({ phone, code: '000001' }).expect(400);
    await request(app.getHttpServer()).post('/v1/auth/otp/verify').send({ phone, code: '000002' }).expect(400);

    // 3 erradas já eram o limite de tentativas — a 4ª nem com o código certo passa.
    await request(app.getHttpServer()).post('/v1/auth/otp/verify').send({ phone, code }).expect(400);
  });

  it('2º pedido antes do cooldown: 429 com Retry-After', async () => {
    const phone = randomPhone();
    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);

    const res = await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(429);
    expect(res.headers['retry-after']).toBe('60');
    expect(res.body).toMatchObject({ error: 'rate_limited', kind: 'cooldown' });
  });

  it('telefone mal formatado: 400', async () => {
    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone: '123' }).expect(400);
  });
});

describe('POST /v1/store/:slug/auth/otp (customer)', () => {
  it('1º login (telefone novo no tenant): cria customer', async () => {
    const phone = randomPhone();

    await request(app.getHttpServer())
      .post(`/v1/store/${testTenantSlug}/auth/otp/request`)
      .send({ phone })
      .expect(202);
    const code = await getLastSentCode();

    const res = await request(app.getHttpServer())
      .post(`/v1/store/${testTenantSlug}/auth/otp/verify`)
      .send({ phone, code })
      .expect(200);

    expect(res.body.user.id).toBeTruthy();
    const created = await migratorPrisma.customer.findUnique({ where: { id: res.body.user.id } });
    expect(created).not.toBeNull();
    expect(created?.tenantId).toBe(testTenantId);
  });

  it('mesmo telefone em DOIS tenants diferentes: dois customers isolados', async () => {
    const otherTenant = await migratorPrisma.tenant.create({
      data: { slug: `${testTenantSlug}-b`, name: 'E2E Test Tenant B', timezone: 'America/Sao_Paulo' },
    });
    extraTenantIds.push(otherTenant.id); // afterAll limpa mesmo se o teste falhar
    const phone = randomPhone();

    await request(app.getHttpServer())
      .post(`/v1/store/${testTenantSlug}/auth/otp/request`)
      .send({ phone })
      .expect(202);
    const codeA = await getLastSentCode();
    const resA = await request(app.getHttpServer())
      .post(`/v1/store/${testTenantSlug}/auth/otp/verify`)
      .send({ phone, code: codeA })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/store/${otherTenant.slug}/auth/otp/request`)
      .send({ phone })
      .expect(202);
    const codeB = await getLastSentCode();
    const resB = await request(app.getHttpServer())
      .post(`/v1/store/${otherTenant.slug}/auth/otp/verify`)
      .send({ phone, code: codeB })
      .expect(200);

    expect(resA.body.user.id).not.toBe(resB.body.user.id);
    // limpeza de otherTenant fica no afterAll (extraTenantIds) — sobrevive
    // a uma falha/timeout no meio deste teste.
  }, 15_000);

  it('slug inexistente: 404', async () => {
    await request(app.getHttpServer())
      .post('/v1/store/loja-que-nao-existe-e2e/auth/otp/request')
      .send({ phone: randomPhone() })
      .expect(404);
  });

  it('N verifys concorrentes em tenants diferentes: contexto de tenant nunca vaza entre requests (AsyncLocalStorage por request via RequestContextService.run)', async () => {
    const otherTenant = await migratorPrisma.tenant.create({
      data: { slug: `${testTenantSlug}-concurrent`, name: 'E2E Test Tenant Concurrent', timezone: 'America/Sao_Paulo' },
    });
    extraTenantIds.push(otherTenant.id);

    // Cada "raia" resolve OTP + verify pro SEU tenant, em paralelo com a
    // outra — se o contexto de tenant vazasse entre requests concorrentes
    // (ex.: variável compartilhada em vez de AsyncLocalStorage por run()),
    // o customer criado apareceria no tenant errado. Busca a mensagem PELO
    // TELEFONE (não "a última enviada") porque em concorrência de verdade
    // outra raia pode ter mandado uma mensagem no meio do caminho.
    function codeSentTo(phone: string): string {
      const mock = app.get<MockMessagingProvider>(MESSAGING_PROVIDER);
      const message = mock.getSentMessages().find((m) => m.to === phone);
      if (!message) throw new Error(`nenhuma mensagem enviada pro telefone ${phone}`);
      return extractCode(message.message);
    }

    async function verifyInTenant(slug: string): Promise<{ customerId: string }> {
      const phone = randomPhone();
      await request(app.getHttpServer()).post(`/v1/store/${slug}/auth/otp/request`).send({ phone }).expect(202);
      const res = await request(app.getHttpServer())
        .post(`/v1/store/${slug}/auth/otp/verify`)
        .send({ phone, code: codeSentTo(phone) })
        .expect(200);
      return { customerId: res.body.user.id };
    }

    const rounds = 6;
    const results = await Promise.all(
      Array.from({ length: rounds }, (_, i) =>
        verifyInTenant(i % 2 === 0 ? testTenantSlug : otherTenant.slug),
      ),
    );

    for (const [i, result] of results.entries()) {
      const expectedTenantId = i % 2 === 0 ? testTenantId : otherTenant.id;
      const customer = await migratorPrisma.customer.findUniqueOrThrow({ where: { id: result.customerId } });
      expect(customer.tenantId).toBe(expectedTenantId);
    }
  }, 30_000);
});
