import { randomBytes } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@molho/db';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import type { RequestContextService } from '../context/request-context.service';
import { MESSAGING_PROVIDER } from '../messaging/messaging.module';
import type { MockMessagingProvider } from '../messaging/mock-messaging.provider';
import { PrismaCheckoutOrderRepository } from './checkout-order.repository';

/**
 * e2e de verdade: Postgres real (RLS, PostGIS) + Redis real (rate limit) +
 * MockMessagingProvider (sem ZENVIA_API_KEY, nunca bate na Zenvia).
 *
 * Cobre o fluxo ponta a ponta do Épico 7: revalidação pública →  login por
 * OTP do cliente → criação de pedido autenticada → linhas reais em
 * addresses/orders/order_items/order_item_modifiers/order_status_history.
 * Casos de borda (preço mudou, zona, horário, mínimo) já têm cobertura
 * exaustiva em checkout-revalidation.service.test.ts — aqui só o caminho
 * feliz + os 2 desvios que dependem de HTTP/DB de verdade (divergência
 * detectada só na criação, guard sem token).
 */

const STORE_LAT = -29.6;
const STORE_LNG = -51.17;
/**
 * CEP REAL de Estância Velha/RS (Rua Ereda Weber, bairro União) — conferido
 * no ViaCEP, não inventado. `93600-000` PARECE o CEP geral da cidade e não
 * existe (`{"erro":"true"}`), o que fazia todo checkout virar 422
 * `cep_not_found`. Se este teste começar a dar 422, confira o CEP no ViaCEP
 * ANTES de suspeitar do middleware.
 */
const CEP_ATENDIDO = '93610-000';
/** CEP real de São Paulo/SP — cidade que a loja não atende. */
const CEP_FORA_DE_AREA = '01310-100';

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
let redis: Redis | null = null;

const slug = `e2e-checkout-${Date.now()}`;
const otherSlug = `e2e-checkout-other-${Date.now()}`;
let tenantId: string;
let otherTenantId: string;
let storeId: string;
let categoryId: string;
let productId: string;
let modifierId: string;

async function getLastSentCode(): Promise<string> {
  const mock = app.get<MockMessagingProvider>(MESSAGING_PROVIDER);
  const sent = mock.getSentMessages();
  const last = sent[sent.length - 1];
  if (!last) throw new Error('nenhuma mensagem enviada pelo MockMessagingProvider');
  return extractCode(last.message);
}

async function loginCustomer(loginSlug: string = slug): Promise<{ customerId: string; accessToken: string }> {
  const phone = randomPhone();
  await request(app.getHttpServer()).post(`/v1/store/${loginSlug}/auth/otp/request`).send({ phone }).expect(202);
  const code = await getLastSentCode();
  const res = await request(app.getHttpServer())
    .post(`/v1/store/${loginSlug}/auth/otp/verify`)
    .send({ phone, code })
    .expect(200);
  return { customerId: res.body.user.id, accessToken: res.body.accessToken };
}

function checkoutBody(
  overrides: {
    unitBasePriceCents?: number;
    expectedDeliveryFeeCents?: number;
    postalCode?: string;
    paymentMethod?: 'pix' | 'cash_on_delivery' | 'card_on_delivery';
    changeForCents?: number | null;
  } = {},
) {
  return {
    items: [
      {
        productId,
        unitBasePriceCents: overrides.unitBasePriceCents ?? 2890,
        modifiers: [{ modifierId, priceDeltaCents: 400 }],
        quantity: 2,
        notes: 'sem cebola',
      },
    ],
    fulfillmentType: 'delivery',
    address: {
      label: 'Casa',
      // CEP + número: o servidor deriva cidade/rua/ponto (Épico 6, Bloco 2).
      // Os campos de texto vão vazios de propósito — é o caminho normal,
      // com o ViaCEP do servidor preenchendo tudo.
      postalCode: overrides.postalCode ?? CEP_ATENDIDO,
      number: '120',
      complement: null,
      street: '',
      neighborhood: '',
      city: '',
      state: '',
      referencePoint: null,
      expectedDeliveryFeeCents: overrides.expectedDeliveryFeeCents ?? 800,
    },
    paymentMethod: overrides.paymentMethod ?? 'pix',
    ...(overrides.paymentMethod === 'cash_on_delivery' ? { changeForCents: overrides.changeForCents ?? null } : {}),
  };
}

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

  const tenant = await migratorPrisma.tenant.create({
    data: { slug, name: 'Checkout E2E', timezone: 'America/Sao_Paulo' },
  });
  tenantId = tenant.id;
  // channel.storefront (guard estático do controller) + payments.pix_static/
  // payments.on_delivery (Épico 8, checagem DINÂMICA por paymentMethod dentro
  // de CheckoutOrderService — sem estas duas, todo /checkout/orders vira 409
  // PaymentMethodNotAvailableError, mesmo que o resto do pedido esteja certo).
  for (const moduleKey of ['channel.storefront', 'payments.pix_static', 'payments.on_delivery']) {
    await migratorPrisma.tenantEntitlement.create({ data: { tenantId, moduleKey, source: 'plan', status: 'active' } });
    await migratorPrisma.tenantSetting.create({ data: { tenantId, moduleKey, enabled: true } });
  }

  const store = await migratorPrisma.store.create({
    data: {
      tenantId,
      name: 'Checkout E2E',
      addressText: 'Rua X, 1',
      timezone: 'America/Sao_Paulo',
      minOrderCents: 1000,
      pixKey: 'checkout-e2e@molho.test',
      pixKeyType: 'email',
      pixMerchantCity: 'Sao Paulo',
    },
  });
  storeId = store.id;
  await migratorPrisma.$executeRaw`
    UPDATE stores SET geo = ST_SetSRID(ST_MakePoint(${STORE_LNG}, ${STORE_LAT}), 4326)::geography WHERE id = ${storeId}::uuid
  `;

  const category = await migratorPrisma.category.create({
    data: { tenantId, name: 'Hambúrgueres', sortOrder: 0, visible: true },
  });
  categoryId = category.id;
  const product = await migratorPrisma.product.create({
    data: { tenantId, categoryId: category.id, name: 'X-Burger', basePriceCents: 2890, available: true },
  });
  productId = product.id;
  const group = await migratorPrisma.modifierGroup.create({
    data: { tenantId, productId, name: 'Adicionais', min: 0, max: 2 },
  });
  const modifier = await migratorPrisma.modifier.create({
    data: { tenantId, groupId: group.id, name: 'Bacon', priceDeltaCents: 400 },
  });
  modifierId = modifier.id;

  // Aberta o dia inteiro, todo dia — teste não depende de que dia/hora rodou.
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  for (const dayOfWeek of weekdays) {
    await migratorPrisma.storeHours.create({ data: { tenantId, storeId, dayOfWeek, opensAtMinutes: 0, closesAtMinutes: 1439 } });
  }

  // Zona por CIDADE (Épico 6, Bloco 2): o CEP do checkout resolve pra
  // Estância Velha, e é a CIDADE que decide a taxa — não a distância.
  await migratorPrisma.$executeRaw`
    INSERT INTO delivery_zones (tenant_id, store_id, name, city, state, fee_cents, eta_min_minutes, eta_max_minutes, priority)
    VALUES (${tenantId}::uuid, ${storeId}::uuid, 'Estância Velha', 'Estância Velha', 'RS', 800, 30, 50, 0)
  `;

  // Tenant B: só existe pra provar isolamento — login por OTP não exige
  // nenhum módulo (CustomerAuthController não tem @RequireModule), então
  // nem precisa de entitlement/store/produto pra logar um customer nele.
  const other = await migratorPrisma.tenant.create({
    data: { slug: otherSlug, name: 'Outro Tenant E2E', timezone: 'America/Sao_Paulo' },
  });
  otherTenantId = other.id;

  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
    const keys = await redis.keys(`storefront:rl:${slug}:*`);
    if (keys.length) await redis.del(...keys);
    // CheckoutOrderRateLimitMiddleware (5 pedidos/10min por slug+IP) — este
    // arquivo sozinho passa de 5 POSTs em /checkout/orders (2, 3, 4, 4b, 4c,
    // 5), então limpa ANTES de rodar. Nunca precisou disto até o wiring do
    // provider ser corrigido (`CHECKOUT_ORDER_RATE_LIMITER` não exportado de
    // `OrdersModule` — o middleware nem carregava, então nunca contava nada).
    const orderKeys = await redis.keys(`checkout:orders:rl:${slug}:*`);
    if (orderKeys.length) await redis.del(...orderKeys);
  }
}, 30_000);

afterAll(async () => {
  if (migratorPrisma) {
    await migratorPrisma.orderItemModifier.deleteMany({ where: { tenantId } });
    await migratorPrisma.orderItem.deleteMany({ where: { tenantId } });
    await migratorPrisma.orderStatusHistory.deleteMany({ where: { tenantId } });
    await migratorPrisma.order.deleteMany({ where: { tenantId } });
    await migratorPrisma.address.deleteMany({ where: { tenantId } });
    await migratorPrisma.$executeRaw`DELETE FROM delivery_zones WHERE tenant_id = ${tenantId}::uuid`;
    await migratorPrisma.storeHours.deleteMany({ where: { tenantId } });
    await migratorPrisma.modifier.deleteMany({ where: { tenantId } });
    await migratorPrisma.modifierGroup.deleteMany({ where: { tenantId } });
    await migratorPrisma.product.deleteMany({ where: { tenantId } });
    await migratorPrisma.category.deleteMany({ where: { tenantId } });
    await migratorPrisma.customer.deleteMany({ where: { tenantId } });
    await migratorPrisma.store.deleteMany({ where: { tenantId } });
    await migratorPrisma.tenantSetting.deleteMany({ where: { tenantId } });
    await migratorPrisma.tenantEntitlement.deleteMany({ where: { tenantId } });
    await migratorPrisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});

    await migratorPrisma.customer.deleteMany({ where: { tenantId: otherTenantId } });
    await migratorPrisma.tenant.delete({ where: { id: otherTenantId } }).catch(() => {});

    await migratorPrisma.$disconnect();
  }
  if (redis) {
    const keys = await redis.keys(`storefront:rl:${slug}:*`);
    if (keys.length) await redis.del(...keys);
    const orderKeys = await redis.keys(`checkout:orders:rl:${slug}:*`);
    if (orderKeys.length) await redis.del(...orderKeys);
    await redis.quit();
  }
  await app?.close();
}, 20_000);

describe('POST /v1/store/:slug/checkout/revalidate', () => {
  it('1) caminho feliz: público, sem token, devolve subtotal/fee/total corretos e canSubmit true', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/store/${slug}/checkout/revalidate`)
      .send(checkoutBody())
      .expect(200);

    expect(res.body).toMatchObject({
      subtotalCents: 6580, // (2890 + 400) * 2
      withinZone: true,
      deliveryFeeCents: 800,
      isOpenNow: true,
      totalCents: 7380,
      hasUnfavorableDivergence: false,
      canSubmit: true,
    });
  });

  /**
   * Os TRÊS desfechos do Bloco 2, ponta a ponta — a distinção entre eles é o
   * que decide se o cliente consegue comprar.
   *
   * Estes dois casos batem no ViaCEP/Nominatim DE VERDADE (é e2e). O
   * middleware cacheia por CEP no Redis, então repetição não vira tráfego
   * externo — mas ViaCEP fora do ar faz falhar aqui.
   */
  it('1b) cidade não atendida: 200 gracioso com withinZone false, NUNCA 4xx', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/store/${slug}/checkout/revalidate`)
      .send(checkoutBody({ postalCode: CEP_FORA_DE_AREA }))
      .expect(200);

    // "Não entregamos aí" é resposta de negócio: o cliente vê o motivo e
    // troca de endereço. Erro seria mentira — o endereço existe.
    expect(res.body).toMatchObject({ withinZone: false, deliveryFeeCents: null, totalCents: null, canSubmit: false });
  });

  it('1c) CEP inexistente: 422 — o único caso em que não dá pra prosseguir', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/store/${slug}/checkout/revalidate`)
      .send(checkoutBody({ postalCode: '00000-000' }))
      .expect(422);

    expect(res.body).toMatchObject({ error: 'address_unresolvable', reason: 'cep_not_found' });
  });

  it('1d) lat/lng mandados pelo cliente são descartados, não usados como ponto', async () => {
    // Cliente antigo (ou adulterado) mandando coordenada: `whitelist: true`
    // no ValidationPipe tira do body, e a taxa continua vindo da CIDADE.
    const comCoordenada = checkoutBody();
    (comCoordenada.address as Record<string, unknown>).lat = -23.55;
    (comCoordenada.address as Record<string, unknown>).lng = -46.63;

    const res = await request(app.getHttpServer())
      .post(`/v1/store/${slug}/checkout/revalidate`)
      .send(comCoordenada)
      .expect(200);

    expect(res.body).toMatchObject({ withinZone: true, deliveryFeeCents: 800 });
  });
});

describe('POST /v1/store/:slug/checkout/orders', () => {
  it('2) sem token: 401', async () => {
    await request(app.getHttpServer()).post(`/v1/store/${slug}/checkout/orders`).send(checkoutBody()).expect(401);
  });

  it('3) preço subiu desde a revalidação: 409 com a revalidação fresca, nenhum pedido criado', async () => {
    const { accessToken } = await loginCustomer();

    const res = await request(app.getHttpServer())
      .post(`/v1/store/${slug}/checkout/orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(checkoutBody({ unitBasePriceCents: 1000 })) // cliente acha que custa 1000, banco diz 2890
      .expect(409);

    expect(res.body.hasUnfavorableDivergence).toBe(true);
    expect(res.body.items[0].priceChanged).toBe(true);

    const count = await migratorPrisma.order.count({ where: { tenantId } });
    expect(count).toBe(0);
  }, 15_000);

  it('4) caminho feliz: cria endereço real, pedido, itens/modificadores e a 1ª linha de order_status_history', async () => {
    const { customerId, accessToken } = await loginCustomer();

    const res = await request(app.getHttpServer())
      .post(`/v1/store/${slug}/checkout/orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(checkoutBody())
      .expect(201);

    expect(res.body).toMatchObject({ status: 'received', paymentStatus: 'aguardando_confirmacao', paymentMethod: 'pix', totalCents: 7380 });
    expect(res.body.pix.payload).toContain('BR.GOV.BCB.PIX');

    const order = await migratorPrisma.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
    expect(order.customerId).toBe(customerId);
    expect(order.subtotalCents).toBe(6580);
    expect(order.deliveryFeeCents).toBe(800);
    expect(order.totalCents).toBe(7380);
    expect(order.status).toBe('received');
    expect(order.paymentMethod).toBe('pix');
    expect(order.changeForCents).toBeNull();
    expect(order.deliveryAddressId).toBeTruthy();

    const address = await migratorPrisma.address.findUniqueOrThrow({ where: { id: order.deliveryAddressId! } });
    expect(address.customerId).toBe(customerId);
    // O endereço gravado é o do ViaCEP, não o texto que o cliente mandou —
    // o body vai com street/city vazios de propósito (Épico 6, Bloco 2). É a
    // prova ponta a ponta de que o servidor é a fonte de verdade do endereço.
    expect(address.street).toBe('Rua Ereda Weber');
    expect(address.city).toBe('Estância Velha');
    expect(address.postalCode).toBe(CEP_ATENDIDO);
    // CEP autoritativo: o pedido nasce sem marca de conferência pro lojista.
    expect(order.deliveryPostalCodeVerified).toBe(true);
    expect(order.deliveryCity).toBe('Estância Velha');

    const items = await migratorPrisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId, quantity: 2, unitBasePriceCents: 2890, lineTotalCents: 6580 });

    const modifiers = await migratorPrisma.orderItemModifier.findMany({ where: { orderItemId: items[0]!.id } });
    expect(modifiers).toHaveLength(1);
    expect(modifiers[0]).toMatchObject({ modifierId, priceDeltaCents: 400 });

    const history = await migratorPrisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: 'received', customerId, actorId: null });
  }, 15_000);

  it('4b) cash_on_delivery: cria pedido sem QR, devolve changeForCents, grava payment_method/change_for_cents no banco', async () => {
    const { accessToken } = await loginCustomer();

    const res = await request(app.getHttpServer())
      .post(`/v1/store/${slug}/checkout/orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(checkoutBody({ paymentMethod: 'cash_on_delivery', changeForCents: 8000 }))
      .expect(201);

    expect(res.body).toMatchObject({ paymentMethod: 'cash_on_delivery', changeForCents: 8000, totalCents: 7380 });
    expect(res.body.pix).toBeUndefined();

    const order = await migratorPrisma.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
    expect(order.paymentMethod).toBe('cash_on_delivery');
    expect(order.changeForCents).toBe(8000);
  }, 15_000);

  it('4c) cash_on_delivery com changeForCents menor que o total: 400, nenhum pedido criado', async () => {
    const { accessToken } = await loginCustomer();
    const countAntes = await migratorPrisma.order.count({ where: { tenantId } });

    await request(app.getHttpServer())
      .post(`/v1/store/${slug}/checkout/orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(checkoutBody({ paymentMethod: 'cash_on_delivery', changeForCents: 100 })) // total é 7380
      .expect(400);

    const countDepois = await migratorPrisma.order.count({ where: { tenantId } });
    expect(countDepois).toBe(countAntes);
  }, 15_000);

  it('5) token de cliente de OUTRO tenant: 404 — RLS não deixa o customer aparecer neste tenant, nenhum pedido novo criado', async () => {
    // Este describe já fez 5 POSTs em /checkout/orders antes deste (2, 3, 4,
    // 4b, 4c) — o MESMO teto que protege a loja de spam (5/10min por
    // slug+IP, CheckoutOrderRateLimitMiddleware). Isto testa RLS, não rate
    // limit: reseta o balde pra não confundir "429 porque o arquivo já gastou
    // a cota" com o 404 que este teste de verdade quer provar.
    if (redis) {
      const keys = await redis.keys(`checkout:orders:rl:${slug}:*`);
      if (keys.length) await redis.del(...keys);
    }

    const { accessToken } = await loginCustomer(otherSlug);
    const countAntes = await migratorPrisma.order.count({ where: { tenantId } });

    await request(app.getHttpServer())
      .post(`/v1/store/${slug}/checkout/orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(checkoutBody())
      .expect(404);

    const countDepois = await migratorPrisma.order.count({ where: { tenantId } });
    expect(countDepois).toBe(countAntes);
  }, 15_000);
});

describe('PrismaCheckoutOrderRepository.lockProductsForUpdate — corrida real no Postgres', () => {
  /**
   * Constrói um repositório real preso a UM client transacional específico —
   * não usa RequestContextService/AsyncLocalStorage de verdade (não faz
   * sentido fora de um request HTTP), só o suficiente pra exercitar o MESMO
   * método (`lockProductsForUpdate`) que `CheckoutOrderService.createOrder()`
   * chama em produção, contra duas transações Postgres genuinamente
   * concorrentes.
   */
  function repositoryFor(tx: Prisma.TransactionClient): PrismaCheckoutOrderRepository {
    const fakeRequestContext = { getClient: () => tx, getTenantId: () => tenantId } as unknown as RequestContextService;
    return new PrismaCheckoutOrderRepository(fakeRequestContext);
  }

  it('transação B fica bloqueada em FOR UPDATE até A commitar, e então enxerga preço/disponibilidade JÁ ATUALIZADOS', async () => {
    const product = await migratorPrisma.product.create({
      data: { tenantId, categoryId, name: 'Produto da corrida', basePriceCents: 1000, available: true },
    });

    let releaseA: () => void = () => {};
    const heldUntilReleased = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    let bUnblocked = false;

    const txA = migratorPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.is_platform', 'false', true)`;
      await repositoryFor(tx).lockProductsForUpdate([product.id]);
      // Muda preço E disponibilidade DENTRO da transação, ainda sem commitar.
      await tx.product.update({ where: { id: product.id }, data: { basePriceCents: 5000, available: false } });
      await heldUntilReleased; // segura o lock até o teste mandar liberar
    });

    // Dá tempo real (round-trip Neon) pra A garantidamente já ter o lock antes de B tentar.
    await new Promise((resolve) => setTimeout(resolve, 800));

    const txB = migratorPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.is_platform', 'false', true)`;
      await repositoryFor(tx).lockProductsForUpdate([product.id]); // deve BLOQUEAR aqui até A liberar
      bUnblocked = true;
      return tx.product.findUniqueOrThrow({ where: { id: product.id } });
    });

    // Prova que B continua bloqueado enquanto A segura o lock.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(bUnblocked).toBe(false);

    releaseA();
    await txA;

    const productSeenByB = await txB;
    expect(bUnblocked).toBe(true);
    expect(productSeenByB.basePriceCents).toBe(5000);
    expect(productSeenByB.available).toBe(false);
  }, 20_000);
});
