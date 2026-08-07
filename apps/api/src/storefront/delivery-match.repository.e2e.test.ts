import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RequestContextService } from '../context/request-context.service';
import { PrismaDeliveryMatchRepository } from './delivery-match.repository';

/**
 * Postgres + PostGIS reais: `molho_city_key` e `ST_Covers` são SQL, e o
 * ponto do épico é que os DOIS tipos de zona coexistem no mesmo tenant.
 * Nada disso é testável contra fake.
 *
 * Roda como `app_migrator` (mesmo padrão dos outros e2e) — o que está sob
 * teste é a QUERY de match, não a RLS, que já tem cobertura própria.
 */

const STORE_LAT = -29.6482;
const STORE_LNG = -51.1789;

let prisma: PrismaClient;
let repository: PrismaDeliveryMatchRepository;
let tenantId: string;
let storeId: string;

const slug = `e2e-zona-${Date.now()}`;

beforeAll(async () => {
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

  // Só `getClient()` é usado pelo repositório — o resto do RequestContextService
  // não participa desta query.
  repository = new PrismaDeliveryMatchRepository({ getClient: () => prisma } as unknown as RequestContextService);

  const tenant = await prisma.tenant.create({ data: { slug, name: 'Zona E2E', timezone: 'America/Sao_Paulo' } });
  tenantId = tenant.id;

  const store = await prisma.store.create({
    data: { tenantId, name: 'Zona E2E', addressText: 'Av. Brasil, 1684', timezone: 'America/Sao_Paulo' },
  });
  storeId = store.id;
  await prisma.$executeRaw`
    UPDATE stores SET geo = ST_SetSRID(ST_MakePoint(${STORE_LNG}, ${STORE_LAT}), 4326)::geography WHERE id = ${storeId}::uuid
  `;

  // Duas zonas por CIDADE — acentos que a Cabanhas bate de verdade: "â" em
  // Estância, "ã" em Portão. Se o mapa de acentos de molho_city_key perder
  // um caractere, é AQUI que aparece (e não num exemplo genérico).
  for (const [city, feeCents] of [
    ['Estância Velha', 800],
    ['Portão', 1500],
  ] as const) {
    await prisma.$executeRaw`
      INSERT INTO delivery_zones (tenant_id, store_id, name, city, state, fee_cents, eta_min_minutes, eta_max_minutes, priority)
      VALUES (${tenantId}::uuid, ${storeId}::uuid, ${city}, ${city}, 'RS', ${feeCents}, 30, 45, 0)
    `;
  }

  // ...e uma por RAIO no MESMO tenant: é o caminho que não pode morrer.
  // priority 0 de propósito — prova que cidade ganha por TIPO, não por
  // desempate de priority.
  await prisma.$executeRaw`
    INSERT INTO delivery_zones (tenant_id, store_id, name, polygon, fee_cents, eta_min_minutes, eta_max_minutes, priority)
    VALUES (${tenantId}::uuid, ${storeId}::uuid, 'Raio 5km',
            ST_Buffer((SELECT geo FROM stores WHERE id = ${storeId}::uuid), 5000), 2500, 60, 90, 0)
  `;
}, 30_000);

afterAll(async () => {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM delivery_zones WHERE tenant_id = ${tenantId}::uuid`;
  await prisma.store.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('PrismaDeliveryMatchRepository — cidade e polígono no mesmo tenant', () => {
  it('casa cidade com acento exatamente como o ViaCEP devolve', async () => {
    const zone = await repository.findMatchingZone({ city: 'Estância Velha', state: 'RS', lat: null, lng: null });
    expect(zone).toMatchObject({ name: 'Estância Velha', feeCents: 800 });
  });

  it('casa "Estancia Velha" sem acento, minúscula e com espaço sobrando', async () => {
    const zone = await repository.findMatchingZone({ city: '  estancia velha ', state: ' rs ', lat: null, lng: null });
    expect(zone).toMatchObject({ feeCents: 800 });
  });

  it('casa "Portao" sem o til — o outro acento do piloto', async () => {
    const zone = await repository.findMatchingZone({ city: 'PORTAO', state: 'RS', lat: null, lng: null });
    expect(zone).toMatchObject({ name: 'Portão', feeCents: 1500 });
  });

  it('cidade servida sem ponto nenhum ainda casa (geocode do ponto falhou)', async () => {
    const zone = await repository.findMatchingZone({ city: 'Portão', state: 'RS', lat: null, lng: null });
    expect(zone?.feeCents).toBe(1500);
  });

  it('cidade vence o polígono quando os dois casam, mesmo com priority igual', async () => {
    const zone = await repository.findMatchingZone({
      city: 'Estância Velha',
      state: 'RS',
      lat: STORE_LAT,
      lng: STORE_LNG,
    });
    expect(zone).toMatchObject({ name: 'Estância Velha', feeCents: 800 });
  });

  it('cidade não servida com ponto dentro do raio cai no polígono — caminho de raio vivo', async () => {
    const zone = await repository.findMatchingZone({
      city: 'Canoas',
      state: 'RS',
      lat: STORE_LAT,
      lng: STORE_LNG,
    });
    expect(zone).toMatchObject({ name: 'Raio 5km', feeCents: 2500 });
  });

  it('cidade certa mas UF errada não casa — "Estância Velha/SP" não é a nossa', async () => {
    const zone = await repository.findMatchingZone({ city: 'Estância Velha', state: 'SP', lat: null, lng: null });
    expect(zone).toBeNull();
  });

  it('fora de tudo: cidade não servida e ponto longe do raio', async () => {
    const zone = await repository.findMatchingZone({ city: 'Canoas', state: 'RS', lat: -23.55, lng: -46.63 });
    expect(zone).toBeNull();
  });

  it('sem cidade e sem ponto não casa com zona nenhuma', async () => {
    const zone = await repository.findMatchingZone({ city: null, state: null, lat: null, lng: null });
    expect(zone).toBeNull();
  });
});
