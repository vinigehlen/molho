import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@molho/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RequestContextService } from '../context/request-context.service';
import type { CatalogActor } from './catalog-actor';
import { PrismaProductOfferRepository } from './product-offer.repository';
import { PrismaProductRepository } from './product.repository';

/** Postgres real: prova backfill, triggers bidirecionais, FK composta, lock,
 * audit_log e RLS. Usar só o migrator aqui mascararia a policy, pois o dono
 * das tabelas ignora RLS; por isso consultas de negócio passam pelo client
 * runtime dentro da mesma cerimônia de SET LOCAL da API. */

let migrator: PrismaClient;
let runtime: PrismaClient;
let tenantA: string;
let tenantB: string;
let categoryA: string;
let categoryA2: string;
let categoryB: string;
let productA: string;
let productB: string;
let actorId: string;

const actor: CatalogActor = { userId: '', role: 'owner', ip: '127.0.0.1' };
const slugPrefix = `e2e-offer-${Date.now()}`;
type TransactionClient = ReturnType<RequestContextService['getClient']>;

async function asTenant<T>(tenantId: string, fn: (tx: TransactionClient) => Promise<T>) {
  return runtime.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_platform', 'false', true)`;
    return fn(tx);
  });
}

function contextFor(tx: TransactionClient, tenantId: string): RequestContextService {
  return {
    getClient: () => tx,
    getTenantId: () => tenantId,
  } as unknown as RequestContextService;
}

beforeAll(async () => {
  migrator = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
  });
  runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const [createdA, createdB] = await Promise.all([
    migrator.tenant.create({
      data: { slug: `${slugPrefix}-a`, name: 'Oferta A', timezone: 'America/Sao_Paulo' },
    }),
    migrator.tenant.create({
      data: { slug: `${slugPrefix}-b`, name: 'Oferta B', timezone: 'America/Sao_Paulo' },
    }),
  ]);
  tenantA = createdA.id;
  tenantB = createdB.id;

  const [createdCategoryA, createdCategoryA2, createdCategoryB] = await Promise.all([
    migrator.category.create({ data: { tenantId: tenantA, name: 'Lanches' } }),
    migrator.category.create({ data: { tenantId: tenantA, name: 'Destaques' } }),
    migrator.category.create({ data: { tenantId: tenantB, name: 'Bebidas' } }),
  ]);
  categoryA = createdCategoryA.id;
  categoryA2 = createdCategoryA2.id;
  categoryB = createdCategoryB.id;

  const [createdProductA, createdProductB] = await Promise.all([
    migrator.product.create({
      data: {
        tenantId: tenantA,
        categoryId: categoryA,
        name: 'X-Salada',
        basePriceCents: 2500,
        pdvCode: 'A-1',
      },
    }),
    migrator.product.create({
      data: { tenantId: tenantB, categoryId: categoryB, name: 'Suco', basePriceCents: 900 },
    }),
  ]);
  productA = createdProductA.id;
  productB = createdProductB.id;

  const user = await migrator.user.create({
    data: { name: 'Owner Oferta E2E', phoneLookupHash: `offer-${randomUUID()}` },
  });
  actorId = user.id;
  actor.userId = user.id;
}, 30_000);

afterAll(async () => {
  if (migrator) {
    await migrator.auditLog.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await migrator.product.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await migrator.category.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await migrator.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await migrator.user.delete({ where: { id: actorId } }).catch(() => {});
    await migrator.$disconnect();
  }
  await runtime?.$disconnect();
});

describe('ProductOffer — expansão compatível', () => {
  it('backfill/trigger deixam uma oferta primária exatamente igual a cada produto', async () => {
    const mismatches = await migrator.$queryRaw<Array<{ total: bigint }>>`
      SELECT count(*)::bigint AS total
      FROM products p
      LEFT JOIN product_offers po
        ON po.tenant_id = p.tenant_id
       AND po.product_id = p.id
       AND po.is_primary = true
      WHERE po.id IS NULL
         OR po.category_id IS DISTINCT FROM p.category_id
         OR po.price_cents IS DISTINCT FROM p.base_price_cents
         OR po.available IS DISTINCT FROM p.available
         OR po.pdv_code IS DISTINCT FROM p.pdv_code
         OR po.sort_order IS DISTINCT FROM p.sort_order
         OR po.deleted_at IS DISTINCT FROM p.deleted_at
    `;
    expect(Number(mismatches[0]?.total ?? 0n)).toBe(0);
  });

  it('escrita pelo repositório legado sincroniza oferta e grava auditoria de preço', async () => {
    const updated = await asTenant(tenantA, async (tx) => {
      const repo = new PrismaProductRepository(contextFor(tx, tenantA));
      const current = await repo.findById(productA);
      if (!current) throw new Error('Produto E2E ausente.');
      return repo.update(
        productA,
        current.version,
        { categoryId: categoryA2, basePriceCents: 2790, pdvCode: 'A-2', sortOrder: 4 },
        actor,
      );
    });
    expect(updated).toMatchObject({
      categoryId: categoryA2,
      basePriceCents: 2790,
      pdvCode: 'A-2',
      sortOrder: 4,
    });

    const offer = await migrator.productOffer.findFirstOrThrow({
      where: { productId: productA, isPrimary: true, deletedAt: null },
    });
    expect(offer).toMatchObject({
      categoryId: categoryA2,
      priceCents: 2790,
      pdvCode: 'A-2',
      sortOrder: 4,
    });
    expect(
      await migrator.auditLog.count({
        where: { tenantId: tenantA, actorId, action: 'catalog.offer_price_update' },
      }),
    ).toBe(1);
  });

  it('escrita pela API nova sincroniza Product, incrementa versões e audita', async () => {
    const beforeProduct = await migrator.product.findUniqueOrThrow({ where: { id: productA } });
    const beforeOffer = await migrator.productOffer.findFirstOrThrow({
      where: { productId: productA, isPrimary: true, deletedAt: null },
    });

    const updated = await asTenant(tenantA, async (tx) => {
      const repo = new PrismaProductOfferRepository(contextFor(tx, tenantA));
      return repo.update(beforeOffer.id, beforeOffer.version, { priceCents: 2990 }, actor);
    });

    const afterProduct = await migrator.product.findUniqueOrThrow({ where: { id: productA } });
    expect(updated).toMatchObject({ priceCents: 2990, version: beforeOffer.version + 1 });
    expect(afterProduct).toMatchObject({
      basePriceCents: 2990,
      version: beforeProduct.version + 1,
    });
    expect(
      await migrator.auditLog.count({
        where: { tenantId: tenantA, actorId, action: 'catalog.offer_price_update' },
      }),
    ).toBe(2);
  });

  it('RLS torna a oferta do tenant B invisível e não atualizável pelo tenant A', async () => {
    const offerB = await migrator.productOffer.findFirstOrThrow({
      where: { productId: productB, isPrimary: true, deletedAt: null },
    });

    const result = await asTenant(tenantA, async (tx) => {
      const repo = new PrismaProductOfferRepository(contextFor(tx, tenantA));
      const visible = await repo.findById(offerB.id);
      const update = await tx.productOffer.updateMany({
        where: { id: offerB.id, version: offerB.version, deletedAt: null },
        data: { priceCents: 1, version: { increment: 1 } },
      });
      return { visible, count: update.count };
    });

    expect(result).toEqual({ visible: null, count: 0 });
    expect(
      (await migrator.productOffer.findUniqueOrThrow({ where: { id: offerB.id } })).priceCents,
    ).toBe(900);
  });

  it('cria e remove uma oferta secundária sem alterar a ponte principal de Product', async () => {
    const beforeProduct = await migrator.product.findUniqueOrThrow({ where: { id: productA } });
    const created = await asTenant(tenantA, async (tx) => {
      const repo = new PrismaProductOfferRepository(contextFor(tx, tenantA));
      return repo.create(
        {
          productId: productA,
          categoryId: categoryA,
          priceCents: 2490,
          pdvCode: 'A-SEC',
        },
        actor,
      );
    });

    expect(created).toMatchObject({ isPrimary: false, categoryId: categoryA, priceCents: 2490 });
    expect(await migrator.product.findUniqueOrThrow({ where: { id: productA } })).toMatchObject({
      categoryId: beforeProduct.categoryId,
      basePriceCents: beforeProduct.basePriceCents,
    });
    expect(
      await migrator.auditLog.count({
        where: { tenantId: tenantA, actorId, action: 'catalog.offer_create' },
      }),
    ).toBe(1);

    await asTenant(tenantA, async (tx) => {
      const repo = new PrismaProductOfferRepository(contextFor(tx, tenantA));
      await repo.softDelete(created.id, created.version);
    });
    expect(
      await migrator.productOffer.findFirst({ where: { id: created.id, deletedAt: null } }),
    ).toBeNull();
    expect(
      await migrator.productOffer.count({
        where: { productId: productA, isPrimary: true, deletedAt: null },
      }),
    ).toBe(1);
  });

  it('FK composta recusa produto de outro tenant mesmo com IDs válidos', async () => {
    await expect(
      migrator.productOffer.create({
        data: {
          tenantId: tenantA,
          productId: productB,
          categoryId: categoryA,
          priceCents: 100,
          isPrimary: false,
        },
      }),
    ).rejects.toThrow();
  });
});
