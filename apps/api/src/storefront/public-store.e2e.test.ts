import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import { storefrontPayloadSchema } from '@molho/contracts';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { STOREFRONT_RATE_LIMIT } from './storefront-rate-limit.guard';

/**
 * e2e de verdade: Postgres real (RLS de fato) + Redis real (rate limit).
 * Primeiro teste no código do gate de módulo NÃO-core (`channel.storefront`
 * exige entitlement + setting, ao contrário de `catalog`, que curto-circuita
 * em `core`). Provisiona os dois na mão (o que o super-admin fará no Épico 14).
 *
 * A rota é pública — sem token, sem X-Tenant-Id. O tenant sai do slug na URL.
 */

let app: INestApplication;
let migratorPrisma: PrismaClient;
let redis: Redis | null = null;

const slugAtiva = `e2e-store-on-${Date.now()}`;
const slugDesligada = `e2e-store-off-${Date.now()}`;
const slugOutraLoja = `e2e-store-other-${Date.now()}`;
let tenantAtivaId: string;
let tenantDesligadaId: string;
let tenantOutraId: string;

async function provisionaStorefront(prisma: PrismaClient, tenantId: string, enabled: boolean) {
  await prisma.tenantEntitlement.create({
    data: { tenantId, moduleKey: 'channel.storefront', source: 'plan', status: 'active' },
  });
  await prisma.tenantSetting.create({
    data: { tenantId, moduleKey: 'channel.storefront', enabled },
  });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  migratorPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

  // Loja ATIVA, com cardápio de verdade.
  const ativa = await migratorPrisma.tenant.create({
    data: { slug: slugAtiva, name: 'Hamburgueria E2E', themeKey: 'brasa', timezone: 'America/Sao_Paulo' },
  });
  tenantAtivaId = ativa.id;
  await migratorPrisma.store.create({
    data: {
      tenantId: tenantAtivaId,
      name: 'Hamburgueria E2E',
      addressText: 'Rua das Palmeiras, 120',
      timezone: 'America/Sao_Paulo',
      minOrderCents: 2000,
    },
  });
  await provisionaStorefront(migratorPrisma, tenantAtivaId, true);

  const visivel = await migratorPrisma.category.create({
    data: { tenantId: tenantAtivaId, name: 'Hambúrgueres', sortOrder: 0, visible: true },
  });
  await migratorPrisma.category.create({
    data: { tenantId: tenantAtivaId, name: 'Categoria escondida', sortOrder: 1, visible: false },
  });
  const burger = await migratorPrisma.product.create({
    data: {
      tenantId: tenantAtivaId,
      categoryId: visivel.id,
      name: 'X-Burger',
      description: 'Blend 180g.',
      basePriceCents: 2890,
      available: true,
    },
  });
  await migratorPrisma.product.create({
    data: {
      tenantId: tenantAtivaId,
      categoryId: visivel.id,
      name: 'X-Bacon (esgotado)',
      basePriceCents: 3200,
      available: false,
    },
  });
  const grupo = await migratorPrisma.modifierGroup.create({
    data: { tenantId: tenantAtivaId, productId: burger.id, name: 'Adicionais', min: 0, max: 2 },
  });
  await migratorPrisma.modifier.create({
    data: { tenantId: tenantAtivaId, groupId: grupo.id, name: 'Bacon', priceDeltaCents: 400 },
  });

  // Loja com o módulo DESLIGADO (entitled, mas setting.enabled=false).
  const desligada = await migratorPrisma.tenant.create({
    data: { slug: slugDesligada, name: 'Loja Desligada E2E', timezone: 'America/Sao_Paulo' },
  });
  tenantDesligadaId = desligada.id;
  await provisionaStorefront(migratorPrisma, tenantDesligadaId, false);

  // OUTRA loja ativa — usada pra provar que o cardápio de uma não vaza na
  // resposta da outra (RLS).
  const outra = await migratorPrisma.tenant.create({
    data: { slug: slugOutraLoja, name: 'Outra Loja E2E', timezone: 'America/Sao_Paulo' },
  });
  tenantOutraId = outra.id;
  await provisionaStorefront(migratorPrisma, tenantOutraId, true);
  const catOutra = await migratorPrisma.category.create({
    data: { tenantId: tenantOutraId, name: 'Pizzas', visible: true },
  });
  await migratorPrisma.product.create({
    data: { tenantId: tenantOutraId, categoryId: catOutra.id, name: 'Margherita', basePriceCents: 4500 },
  });

  // Cada arquivo e2e limpa seu próprio rate-limit de IP (CLAUDE.md § convenções)
  // — todos batem do mesmo localhost, e a suíte rodada 2x se autoderrubaria
  // com 429. Só as chaves DESTE arquivo (por slug).
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
    const keys = await redis.keys('storefront:rl:e2e-store-*');
    if (keys.length) await redis.del(...keys);
  }
}, 30_000);

afterAll(async () => {
  if (migratorPrisma) {
    for (const tid of [tenantAtivaId, tenantOutraId, tenantDesligadaId]) {
      if (!tid) continue;
      await migratorPrisma.modifier.deleteMany({ where: { tenantId: tid } });
      await migratorPrisma.modifierGroup.deleteMany({ where: { tenantId: tid } });
      await migratorPrisma.product.deleteMany({ where: { tenantId: tid } });
      await migratorPrisma.category.deleteMany({ where: { tenantId: tid } });
      await migratorPrisma.store.deleteMany({ where: { tenantId: tid } });
      await migratorPrisma.tenantSetting.deleteMany({ where: { tenantId: tid } });
      await migratorPrisma.tenantEntitlement.deleteMany({ where: { tenantId: tid } });
      await migratorPrisma.tenant.delete({ where: { id: tid } }).catch(() => {});
    }
    await migratorPrisma.$disconnect();
  }
  if (redis) {
    const keys = await redis.keys('storefront:rl:e2e-store-*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  }
  await app?.close();
}, 20_000);

describe('GET /v1/store/:slug', () => {
  it('1) loja ativa → 200 com payload aninhado que satisfaz o contrato público', async () => {
    const res = await request(app.getHttpServer()).get(`/v1/store/${slugAtiva}`).expect(200);

    expect(storefrontPayloadSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.store.slug).toBe(slugAtiva);
    expect(res.body.store.themeKey).toBe('brasa');
    expect(res.body.store.minOrderCents).toBe(2000);
    // Nenhum módulo de pagamento entitled pro tenant — array vazio, não erro (Épico 8).
    expect(res.body.store.availablePaymentMethods).toEqual([]);
  });

  it('2) manda o header de cache de borda', async () => {
    const res = await request(app.getHttpServer()).get(`/v1/store/${slugAtiva}`).expect(200);
    expect(res.headers['cache-control']).toBe('public, s-maxage=30, stale-while-revalidate=60');
  });

  it('3) categoria invisível some; produto esgotado permanece marcado', async () => {
    const res = await request(app.getHttpServer()).get(`/v1/store/${slugAtiva}`).expect(200);

    const nomesCategorias = res.body.categories.map((c: { name: string }) => c.name);
    expect(nomesCategorias).toContain('Hambúrgueres');
    expect(nomesCategorias).not.toContain('Categoria escondida');

    const produtos = res.body.categories[0].products;
    const esgotado = produtos.find((p: { name: string }) => p.name.startsWith('X-Bacon'));
    expect(esgotado.available).toBe(false);
  });

  it('4) traz os modificadores aninhados no produto', async () => {
    const res = await request(app.getHttpServer()).get(`/v1/store/${slugAtiva}`).expect(200);
    const burger = res.body.categories[0].products.find((p: { name: string }) => p.name === 'X-Burger');
    expect(burger.modifierGroups[0].modifiers[0]).toMatchObject({ name: 'Bacon', priceDeltaCents: 400 });
  });

  it('5) RLS: a resposta de uma loja nunca contém produto de outra', async () => {
    const res = await request(app.getHttpServer()).get(`/v1/store/${slugAtiva}`).expect(200);
    const todosProdutos = res.body.categories.flatMap((c: { products: { name: string }[] }) => c.products);
    expect(todosProdutos.some((p: { name: string }) => p.name === 'Margherita')).toBe(false);
  });

  it('5b) availablePaymentMethods (Épico 8): pix exige módulo ATIVO + chave configurada, não só o módulo', async () => {
    // Tenant PRÓPRIO, nunca consultado antes neste arquivo — o cache de
    // módulo (Redis, TTL 60s, ModuleService) guardaria "false" pra
    // payments.on_delivery/pix_static se essa checagem já tivesse rodado
    // pra este tenant antes de conceder o entitlement (escrita direta via
    // Prisma não invalida cache, só o request path faz isso). Tenant novo
    // evita a corrida por construção, sem depender de esperar TTL.
    const slugPagamentos = `e2e-store-pay-${Date.now()}`;
    const tenant = await migratorPrisma.tenant.create({
      data: { slug: slugPagamentos, name: 'Loja Pagamentos E2E', timezone: 'America/Sao_Paulo' },
    });
    await provisionaStorefront(migratorPrisma, tenant.id, true);
    await migratorPrisma.store.create({
      data: { tenantId: tenant.id, name: 'Loja Pagamentos E2E', addressText: 'Rua X, 1', timezone: 'America/Sao_Paulo' },
    });
    for (const moduleKey of ['payments.on_delivery', 'payments.pix_static']) {
      await migratorPrisma.tenantEntitlement.create({ data: { tenantId: tenant.id, moduleKey, source: 'plan', status: 'active' } });
      await migratorPrisma.tenantSetting.create({ data: { tenantId: tenant.id, moduleKey, enabled: true } });
    }

    try {
      // Passo 1: módulos ligados, Store SEM pixKey — mesmo estado que hoje
      // estoura CheckoutStoreNotConfiguredError lá no fim do funil (o bug
      // que este ajuste existe pra evitar).
      const semChave = await request(app.getHttpServer()).get(`/v1/store/${slugPagamentos}`).expect(200);
      expect(semChave.body.store.availablePaymentMethods.sort()).toEqual(['card_on_delivery', 'cash_on_delivery']);

      // Passo 2: configura a chave PIX na Store — agora pix entra na lista
      // (Store é lida fresca a cada request, sem cache — só o módulo tem TTL).
      await migratorPrisma.store.updateMany({
        where: { tenantId: tenant.id },
        data: { pixKey: '+5511999990000', pixKeyType: 'phone', pixMerchantCity: 'Sao Paulo' },
      });

      const comChave = await request(app.getHttpServer()).get(`/v1/store/${slugPagamentos}`).expect(200);
      expect(comChave.body.store.availablePaymentMethods.sort()).toEqual(['card_on_delivery', 'cash_on_delivery', 'pix']);

      // A chave PIX de verdade está no banco (setUp acima) — a resposta HTTP
      // não pode conter o valor cru, só o `availablePaymentMethods` derivado
      // dele. JSON.stringify pra pegar tanto chave quanto valor em qualquer
      // posição do payload, não só as chaves de 1 nível.
      const bruto = JSON.stringify(comChave.body);
      expect(bruto).not.toContain('+5511999990000'); // o valor da chave PIX
      expect(bruto.toLowerCase()).not.toContain('pixkey');
      expect(bruto.toLowerCase()).not.toContain('pixmerchantcity');
    } finally {
      await migratorPrisma.store.deleteMany({ where: { tenantId: tenant.id } });
      await migratorPrisma.tenantSetting.deleteMany({ where: { tenantId: tenant.id } });
      await migratorPrisma.tenantEntitlement.deleteMany({ where: { tenantId: tenant.id } });
      await migratorPrisma.tenant.delete({ where: { id: tenant.id } });
    }
  }, 15_000);

  it('6) módulo channel.storefront desligado → 403 (público não pula o gate de módulo)', async () => {
    await request(app.getHttpServer()).get(`/v1/store/${slugDesligada}`).expect(403);
  });

  it('7) slug inexistente → 404', async () => {
    await request(app.getHttpServer()).get(`/v1/store/nao-existe-${randomUUID()}`).expect(404);
  });

  it('8) estoura o rate limit → 429', async () => {
    const slug = slugAtiva;

    // Em LOTES concorrentes, não em série: cada request é um round-trip real
    // pro Neon (~800ms), e as ~60 necessárias pra cruzar o teto em série
    // estouravam qualquer timeout razoável. O lote de 10 mantém o número de
    // transações simultâneas baixo (Neon já deu P2028 com pool saturado, ver
    // CLAUDE.md § débito técnico) e ainda corta o tempo em ~10x.
    //
    // Concorrência não falseia o resultado: a janela deslizante conta no
    // Redis, e o guard de rate limit roda ANTES do de módulo — request barrada
    // nem chega no banco, então o teto limita a carga sozinho.
    const LOTE = 10;
    let visto429 = false;

    for (let enviadas = 0; enviadas <= STOREFRONT_RATE_LIMIT + 10 && !visto429; enviadas += LOTE) {
      const respostas = await Promise.all(
        Array.from({ length: LOTE }, () => request(app.getHttpServer()).get(`/v1/store/${slug}`)),
      );
      visto429 = respostas.some((res) => res.status === 429);
    }

    expect(visto429).toBe(true);
  }, 60_000);
});
