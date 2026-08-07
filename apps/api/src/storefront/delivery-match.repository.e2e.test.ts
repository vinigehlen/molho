import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RequestContextService } from '../context/request-context.service';
import { type DeliveryLocation, PrismaDeliveryMatchRepository } from './delivery-match.repository';

/**
 * Postgres + PostGIS reais: `molho_city_key` e `ST_Covers` são SQL, e o
 * ponto do épico é que os DOIS tipos de zona coexistem no mesmo tenant.
 * Nada disso é testável contra fake.
 *
 * DOIS clients, de propósito:
 * - `migrator` (DIRECT_URL, dono da tabela) só pra semear/limpar.
 * - `runtime` (DATABASE_URL, `app_runtime`) pra TODA consulta sob teste.
 *
 * A query de match não filtra `tenant_id` — quem dá escopo é a RLS. Rodar o
 * match como `app_migrator` seria testar sem essa camada: `delivery_zones`
 * tem `relforcerowsecurity=false`, e o Postgres NÃO aplica policy ao DONO da
 * tabela, então o teste enxergaria zona de todos os tenants e casaria com o
 * seed de outra loja (foi exatamente o que aconteceu). `matchAsTenant()`
 * reproduz o caminho de produção: transação + `SET LOCAL` dos GUCs, igual
 * `RequestContextService.run()`.
 */

const STORE_LAT = -29.6482;
const STORE_LNG = -51.1789;
/** ~3 km ao norte da loja: fora do raio de 2 km, dentro do de 5 km. */
const LAT_3KM = STORE_LAT + 0.027;

let migrator: PrismaClient;
let runtime: PrismaClient;
let tenantId: string;
let storeId: string;

const slug = `e2e-zona-${Date.now()}`;

/** Mesma cerimônia de RLS que o RequestContextService faz por request. */
async function matchAsTenant(location: DeliveryLocation) {
  return runtime.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_platform', 'false', true)`;
    const repository = new PrismaDeliveryMatchRepository({ getClient: () => tx } as unknown as RequestContextService);
    return repository.findMatchingZone(location);
  });
}

beforeAll(async () => {
  migrator = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
  runtime = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const tenant = await migrator.tenant.create({ data: { slug, name: 'Zona E2E', timezone: 'America/Sao_Paulo' } });
  tenantId = tenant.id;

  const store = await migrator.store.create({
    data: { tenantId, name: 'Zona E2E', addressText: 'Av. Brasil, 1684', timezone: 'America/Sao_Paulo' },
  });
  storeId = store.id;
  await migrator.$executeRaw`
    UPDATE stores SET geo = ST_SetSRID(ST_MakePoint(${STORE_LNG}, ${STORE_LAT}), 4326)::geography WHERE id = ${storeId}::uuid
  `;

  // Duas zonas por CIDADE — acentos que a Cabanhas bate de verdade: "â" em
  // Estância, "ã" em Portão. Se o mapa de acentos de molho_city_key perder
  // um caractere, é AQUI que aparece (e não num exemplo genérico).
  for (const [city, feeCents] of [
    ['Estância Velha', 800],
    ['Portão', 1500],
  ] as const) {
    await migrator.$executeRaw`
      INSERT INTO delivery_zones (tenant_id, store_id, name, city, state, fee_cents, eta_min_minutes, eta_max_minutes, priority)
      VALUES (${tenantId}::uuid, ${storeId}::uuid, ${city}, ${city}, 'RS', ${feeCents}, 30, 45, 0)
    `;
  }

  // ...e TRÊS por RAIO no mesmo tenant: o caminho de polígono não pode
  // morrer, e é aqui que se prova como raios sobrepostos desempatam.
  // - premium 2km, priority 0 → vence por priority explícita
  // - dois de 5km com a MESMA priority 1 → empate, resolvido pela taxa
  for (const [name, radius, feeCents, priority] of [
    ['Raio 2km premium', 2_000, 3000, 0],
    ['Raio 5km caro', 5_000, 2500, 1],
    ['Raio 5km barato', 5_000, 2000, 1],
  ] as const) {
    await migrator.$executeRaw`
      INSERT INTO delivery_zones (tenant_id, store_id, name, polygon, fee_cents, eta_min_minutes, eta_max_minutes, priority)
      VALUES (${tenantId}::uuid, ${storeId}::uuid, ${name},
              ST_Buffer((SELECT geo FROM stores WHERE id = ${storeId}::uuid), ${radius}),
              ${feeCents}, 60, 90, ${priority})
    `;
  }
}, 30_000);

afterAll(async () => {
  if (migrator) {
    await migrator.$executeRaw`DELETE FROM delivery_zones WHERE tenant_id = ${tenantId}::uuid`;
    await migrator.store.deleteMany({ where: { tenantId } });
    await migrator.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await migrator.$disconnect();
  }
  await runtime?.$disconnect();
});

describe('PrismaDeliveryMatchRepository — cidade e polígono no mesmo tenant', () => {
  it('casa cidade com acento exatamente como o ViaCEP devolve', async () => {
    const zone = await matchAsTenant({ city: 'Estância Velha', state: 'RS', lat: null, lng: null });
    expect(zone).toMatchObject({ name: 'Estância Velha', feeCents: 800 });
  });

  it('casa "Estancia Velha" sem acento, minúscula e com espaço sobrando', async () => {
    const zone = await matchAsTenant({ city: '  estancia velha ', state: ' rs ', lat: null, lng: null });
    expect(zone).toMatchObject({ feeCents: 800 });
  });

  it('casa "Portao" sem o til — o outro acento do piloto', async () => {
    const zone = await matchAsTenant({ city: 'PORTAO', state: 'RS', lat: null, lng: null });
    expect(zone).toMatchObject({ name: 'Portão', feeCents: 1500 });
  });

  it('cidade servida sem ponto nenhum ainda casa (geocode do ponto falhou)', async () => {
    const zone = await matchAsTenant({ city: 'Portão', state: 'RS', lat: null, lng: null });
    expect(zone?.feeCents).toBe(1500);
  });

  it('cidade vence o polígono quando os dois casam, mesmo com priority menor no polígono', async () => {
    const zone = await matchAsTenant({ city: 'Estância Velha', state: 'RS', lat: STORE_LAT, lng: STORE_LNG });
    expect(zone).toMatchObject({ name: 'Estância Velha', feeCents: 800 });
  });

  it('cidade não servida com ponto dentro do raio cai no polígono — caminho de raio vivo', async () => {
    const zone = await matchAsTenant({ city: 'Canoas', state: 'RS', lat: LAT_3KM, lng: STORE_LNG });
    expect(zone).toMatchObject({ name: 'Raio 5km barato' });
  });

  it('raios sobrepostos: priority menor vence, mesmo sendo a zona mais CARA', async () => {
    // A premium de 2km custa 3000 e ainda assim ganha das de 5km (2500/2000)
    // — priority é o botão explícito do lojista, taxa não decide sozinha.
    const zone = await matchAsTenant({ city: 'Canoas', state: 'RS', lat: STORE_LAT, lng: STORE_LNG });
    expect(zone).toMatchObject({ name: 'Raio 2km premium', feeCents: 3000 });
  });

  it('raios empatados em priority: a mais barata vence, e sempre a mesma', async () => {
    // Empate no ORDER BY é ordem arbitrária no Postgres — sem o desempate
    // por fee_cents, o mesmo endereço receberia 2500 ou 2000 conforme o
    // plano de execução do momento. Repete pra flagrar não-determinismo.
    for (let i = 0; i < 3; i++) {
      const zone = await matchAsTenant({ city: 'Canoas', state: 'RS', lat: LAT_3KM, lng: STORE_LNG });
      expect(zone).toMatchObject({ name: 'Raio 5km barato', feeCents: 2000 });
    }
  });

  it('cidade certa mas UF errada não casa — "Estância Velha/SP" não é a nossa', async () => {
    const zone = await matchAsTenant({ city: 'Estância Velha', state: 'SP', lat: null, lng: null });
    expect(zone).toBeNull();
  });

  it('fora de tudo: cidade não servida e ponto longe do raio', async () => {
    const zone = await matchAsTenant({ city: 'Canoas', state: 'RS', lat: -23.55, lng: -46.63 });
    expect(zone).toBeNull();
  });

  it('sem cidade e sem ponto não casa com zona nenhuma', async () => {
    const zone = await matchAsTenant({ city: null, state: null, lat: null, lng: null });
    expect(zone).toBeNull();
  });

  it('zona de OUTRO tenant nunca casa — é a RLS que dá escopo à query', async () => {
    // A query não filtra tenant_id de propósito (RLS é a camada). Este caso
    // é o que garante que isso não vira vazamento: o seed de outra loja
    // dentro do mesmo raio geográfico não pode aparecer.
    const outroTenant = await migrator.tenant.create({
      data: { slug: `${slug}-outro`, name: 'Outro', timezone: 'America/Sao_Paulo' },
    });
    const outraLoja = await migrator.store.create({
      data: { tenantId: outroTenant.id, name: 'Outra', addressText: 'x', timezone: 'America/Sao_Paulo' },
    });
    await migrator.$executeRaw`
      INSERT INTO delivery_zones (tenant_id, store_id, name, city, state, fee_cents, eta_min_minutes, eta_max_minutes, priority)
      VALUES (${outroTenant.id}::uuid, ${outraLoja.id}::uuid, 'Canoas', 'Canoas', 'RS', 100, 10, 20, 0)
    `;

    try {
      // 'Canoas' só existe como zona do OUTRO tenant.
      const zone = await matchAsTenant({ city: 'Canoas', state: 'RS', lat: null, lng: null });
      expect(zone).toBeNull();
    } finally {
      await migrator.$executeRaw`DELETE FROM delivery_zones WHERE tenant_id = ${outroTenant.id}::uuid`;
      await migrator.store.deleteMany({ where: { tenantId: outroTenant.id } });
      await migrator.tenant.delete({ where: { id: outroTenant.id } }).catch(() => {});
    }
  });
});
