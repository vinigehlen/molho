import { randomBytes } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, encryptPhone, hashPhoneForLookup } from '@molho/db';
import { parsePhoneNumber, phoneNumberToE164 } from '@molho/contracts';
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

function firstCookie(response: request.Response): string {
  const raw = response.headers['set-cookie']?.[0];
  if (!raw) throw new Error('resposta sem Set-Cookie');
  const pair = raw.split(';')[0];
  if (!pair) throw new Error('Set-Cookie malformado');
  return pair;
}

let app: INestApplication;
let migratorPrisma: PrismaClient;
let testTenantId: string;
const testTenantSlug = `e2e-test-${Date.now()}`;
// Nullable desde a identidade de staff por e-mail (Épico 9c): staff criado
// pelo canal de e-mail não tem hash de telefone. O `continue` no cleanup NÃO
// é cosmético — `deleteMany({ phoneLookupHash: null })` apagaria TODO staff
// por e-mail do banco de staging.
const createdUserPhoneHashes: (string | null)[] = [];
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
}, 30_000);

afterAll(async () => {
  if (typeof migratorPrisma !== 'undefined') {
    // beforeAll com timeout NÃO cancela a Promise. Se ele falhar antes de
    // preencher testTenantId, nunca montar `where: { tenantId: undefined }`:
    // Prisma omite undefined e transformaria o cleanup em deleteMany GLOBAL.
    const tenantIds = [...extraTenantIds];
    if (typeof testTenantId === 'string') tenantIds.unshift(testTenantId);
    for (const id of tenantIds) {
      await migratorPrisma.customer.deleteMany({ where: { tenantId: id } });
      await migratorPrisma.tenant.delete({ where: { id } }).catch(() => {}); // já pode ter sido apagado
    }
    for (const hash of createdUserPhoneHashes) {
      if (!hash) continue;
      await migratorPrisma.user.deleteMany({ where: { phoneLookupHash: hash } });
    }
    await migratorPrisma.$disconnect();
  }
  if (typeof app !== 'undefined') await app.close();
}, 30_000);

async function getLastSentCode(): Promise<string> {
  const mock = app.get<MockMessagingProvider>(MESSAGING_PROVIDER);
  const sent = mock.getSentMessages();
  const last = sent[sent.length - 1];
  if (!last) throw new Error('nenhuma mensagem enviada pelo MockMessagingProvider');
  return extractCode(last.message);
}

/**
 * O verify de staff não cria mais User/user_role sozinho (fechado nesta
 * fatia) — o caminho de produção é convite/bootstrap, fora de escopo aqui.
 * Semeia os dois direto pra exercitar o verify como ele roda depois disso.
 */
async function seedStaffUser(phone: string): Promise<string> {
  const e164 = phoneNumberToE164(parsePhoneNumber(phone));
  const { ciphertext, keyVersion } = encryptPhone(e164);
  const user = await migratorPrisma.user.create({
    data: {
      name: 'Staff E2E',
      phoneCiphertext: Buffer.from(ciphertext),
      phoneLookupHash: hashPhoneForLookup(e164),
      phoneKeyVersion: keyVersion,
    },
  });
  await migratorPrisma.userRole.create({
    data: { userId: user.id, role: 'owner', scopeType: 'tenant', scopeId: testTenantId },
  });
  createdUserPhoneHashes.push(user.phoneLookupHash);
  return user.id;
}

describe('POST /v1/auth/otp (staff)', () => {
  it('1º login: devolve access curto e guarda refresh somente em cookie httpOnly', async () => {
    const phone = randomPhone();
    const userId = await seedStaffUser(phone);

    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = await getLastSentCode();

    const res = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.user.id).toBe(userId);
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('__Host-molho_refresh=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');

    const tenantContexts = await request(app.getHttpServer())
      .get('/v1/me/sessions/tenants')
      .set('Authorization', `Bearer ${res.body.accessToken as string}`)
      .expect(200);
    expect(tenantContexts.body.tenants).toEqual([
      expect.objectContaining({ id: testTenantId, name: 'E2E Test Tenant' }),
    ]);
  });

  it('rotaciona refresh uma vez, exige o cliente do backoffice e rejeita reuso', async () => {
    const phone = randomPhone();
    await seedStaffUser(phone);
    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = await getLastSentCode();
    const login = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code })
      .expect(200);
    const originalCookie = firstCookie(login);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(403);

    const refreshed = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('x-molho-client', 'backoffice')
      .set('Cookie', originalCookie)
      .expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.headers['set-cookie']?.[0]).toContain('__Host-molho_refresh=');

    const reused = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('x-molho-client', 'backoffice')
      .set('Cookie', originalCookie)
      .expect(401);
    expect(reused.headers['set-cookie']?.[0]).toContain('__Host-molho_refresh=;');
  });

  it('logout revoga o dispositivo atual e limpa o cookie', async () => {
    const phone = randomPhone();
    await seedStaffUser(phone);
    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = await getLastSentCode();
    const login = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code })
      .expect(200);
    const cookie = firstCookie(login);

    const logout = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('x-molho-client', 'backoffice')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(logout.headers['set-cookie']?.[0]).toContain('__Host-molho_refresh=;');

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('x-molho-client', 'backoffice')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('telefone sem user (nunca convidado): 400, mesma resposta de código inválido', async () => {
    const phone = randomPhone();
    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = await getLastSentCode();

    const res = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code })
      .expect(400);
    expect(res.body.message).toBe('Código inválido ou expirado.');
  });

  it('user existe mas SEM user_role: 400, mesma resposta de código inválido (sem enumeração)', async () => {
    const phone = randomPhone();
    const e164 = phoneNumberToE164(parsePhoneNumber(phone));
    const { ciphertext, keyVersion } = encryptPhone(e164);
    const user = await migratorPrisma.user.create({
      data: {
        name: 'Staff sem papel E2E',
        phoneCiphertext: Buffer.from(ciphertext),
        phoneLookupHash: hashPhoneForLookup(e164),
        phoneKeyVersion: keyVersion,
      },
    });
    createdUserPhoneHashes.push(user.phoneLookupHash);

    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = await getLastSentCode();

    const res = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code })
      .expect(400);
    expect(res.body.message).toBe('Código inválido ou expirado.');
  });

  it('2º login do MESMO telefone: devolve o mesmo user', async () => {
    const phone = randomPhone();
    const userId = await seedStaffUser(phone);

    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code1 = await getLastSentCode();
    const first = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code: code1 })
      .expect(200);
    expect(first.body.user.id).toBe(userId);

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
  }, 70_000);

  it('verify errado 3x seguidas: 3ª falha com invalid, 4ª (mesmo com código certo) também falha', async () => {
    const phone = randomPhone();
    await seedStaffUser(phone);
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

/**
 * `JwtAuthGuard` numa rota staff-only, genérico — não é "e2e do balcão",
 * é o guard em si. Achado rodando o e2e do épico balcão (order edit): um
 * token de CUSTOMER contra rota staff-only virava 500 cru, não 401 — a
 * assinatura verifica (staff e customer compartilham `MOLHO_JWT_SECRETS`),
 * mas `PrismaUserAuthRepository.getTokenVersion` fazia
 * `users.findUniqueOrThrow({ id: sub })` com um `sub` que é `customerId`,
 * não existe em `users`, e o Prisma `P2025` vazava sem catch. Vale pra
 * TODO endpoint atrás de `JwtAuthGuard` (`OrderAdminController`,
 * `CounterOrderController`, etc.) — fixado na raiz (user-version-repository.ts),
 * coberto aqui de propósito pra nunca reaparecer silenciosamente atrás de
 * uma feature específica.
 */
describe('JwtAuthGuard numa rota staff-only — token de CUSTOMER', () => {
  // Cap de IP (20/hora) é COMPARTILHADO com o resto desta suíte (mesmo IP,
  // mesmo header do comentário do topo do arquivo) — o beforeAll do arquivo
  // só limpa UMA vez, no início; a suíte inteira facilmente passa de 20
  // pedidos de OTP antes de chegar aqui (2 describes acima + o loop
  // concorrente de 6). Limpa de novo, local a este describe, pra estes 2
  // testes nunca dependerem de quantos pedidos os outros já gastaram.
  beforeAll(async () => {
    const redisCleanup = new Redis(process.env.REDIS_URL as string);
    const ipKeys = await redisCleanup.keys('otp_rl:ip:*');
    if (ipKeys.length) await redisCleanup.del(...ipKeys);
    redisCleanup.disconnect();
  });

  it('token de CUSTOMER: 401 (antes do fix: 500 cru de Prisma)', async () => {
    const phone = randomPhone();
    await request(app.getHttpServer()).post(`/v1/store/${testTenantSlug}/auth/otp/request`).send({ phone }).expect(202);
    const code = await getLastSentCode();
    const customerLogin = await request(app.getHttpServer())
      .post(`/v1/store/${testTenantSlug}/auth/otp/verify`)
      .send({ phone, code })
      .expect(200);
    const customerToken = customerLogin.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get('/v1/me/sessions/tenants')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(401);
  });

  it('staff LEGÍTIMO na mesma rota: continua 200 (prova que o fix não afrouxou o caminho feliz)', async () => {
    const phone = randomPhone();
    await seedStaffUser(phone);
    await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = await getLastSentCode();
    const staffLogin = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code })
      .expect(200);
    const staffToken = staffLogin.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get('/v1/me/sessions/tenants')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
  });
});
