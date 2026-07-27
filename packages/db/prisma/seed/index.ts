import {
  MODULE_KEYS,
  type ModuleKey,
  defaultModulesForPlan,
  moduleDef,
  planGrants,
} from '@molho/contracts';
import { PrismaPg } from '@prisma/adapter-pg';
import { S3Client } from '@aws-sdk/client-s3';
import { encryptPhone, hashPhoneForLookup } from '../../src/crypto/phone';
import { PrismaClient } from '../generated/client/client';
import { type SeedCategoryDef, SEED_CATALOGS } from './catalog';
import { type SeedDeliveryDef, type SeedShiftDef, type SeedZoneDef, SEED_DELIVERY } from './delivery';
import {
  fetchAndUploadProductPhoto,
  loadPhotoCredits,
  savePhotoCredits,
  sleep,
  type PhotoCreditRecord,
  type PhotoUploadContext,
} from './photos';
import { seedOrders } from './orders';
import { SEED_PLANS } from './plans';
import { type SeedTenantDef, SEED_TENANTS } from './tenants';

/**
 * Seed idempotente do tenant demo (Épico 2). Roda como app_migrator
 * (DIRECT_URL) — é provisionamento fora do request path normal; RLS
 * bloquearia app_runtime de criar tenant sem o GUC app.is_platform, que só a
 * API seta por request, não um script solto.
 *
 * tenants/users não têm unique key visível pro Prisma (slug e
 * phone_lookup_hash são índice único parcial criado à mão na migration, não
 * @unique no schema.prisma) — por isso é findFirst+create/update, não
 * upsert(). stores nunca teve unique key nenhuma; mesmo padrão.
 * tenant_entitlements/tenant_settings/user_roles têm chave composta real
 * (@@id/@@unique), então esses três usam upsert() de verdade.
 */

function entitledModules(plan: SeedTenantDef['plan']): ModuleKey[] {
  return MODULE_KEYS.filter((key) => !moduleDef(key).core && planGrants(plan, key));
}

function enabledByDefaultModules(plan: SeedTenantDef['plan']): ModuleKey[] {
  return defaultModulesForPlan(plan).filter((key) => !moduleDef(key).core);
}

async function seedTenant(
  prisma: PrismaClient,
  def: SeedTenantDef,
): Promise<{ tenantId: string; storeId: string }> {
  let tenant = await prisma.tenant.findFirst({ where: { slug: def.slug, deletedAt: null } });
  if (tenant) {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { name: def.name, cnpj: def.cnpj, planId: def.plan, themeKey: def.themeKey },
    });
    console.log(`  tenant "${def.slug}" já existia — atualizado (${tenant.id})`);
  } else {
    tenant = await prisma.tenant.create({
      data: {
        slug: def.slug,
        name: def.name,
        cnpj: def.cnpj,
        planId: def.plan,
        themeKey: def.themeKey,
      },
    });
    console.log(`  tenant "${def.slug}" criado (${tenant.id})`);
  }

  const existingStore = await prisma.store.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
  });
  const storeData = {
    tenantId: tenant.id,
    name: def.store.name,
    addressText: def.store.addressText,
    timezone: def.store.timezone,
    phone: def.store.phone,
    whatsappNumber: def.store.whatsappNumber,
    minOrderCents: def.store.minOrderCents,
    pixKey: def.store.pixKey,
    pixKeyType: def.store.pixKeyType,
    pixMerchantCity: def.store.pixMerchantCity,
  };
  const store = existingStore
    ? await prisma.store.update({ where: { id: existingStore.id }, data: storeData })
    : await prisma.store.create({ data: storeData });

  // geo é Unsupported no Prisma DSL (geography) — só dá pra escrever via SQL
  // cru. UPDATE simples, idempotente por natureza (reescreve o mesmo ponto).
  await prisma.$executeRaw`
    UPDATE stores
    SET geo = ST_SetSRID(ST_MakePoint(${def.store.geo.lng}, ${def.store.geo.lat}), 4326)::geography
    WHERE id = ${store.id}::uuid
  `;

  const phoneHash = hashPhoneForLookup(def.owner.phone);
  let owner = await prisma.user.findFirst({
    where: { phoneLookupHash: phoneHash, deletedAt: null },
  });
  if (!owner) {
    const { ciphertext, keyVersion } = encryptPhone(def.owner.phone);
    owner = await prisma.user.create({
      data: {
        name: def.owner.name,
        // Prisma (Bytes) quer Uint8Array<ArrayBuffer> — Buffer é
        // Uint8Array<ArrayBufferLike>, incompatível em modo strict.
        phoneCiphertext: new Uint8Array(ciphertext),
        phoneLookupHash: phoneHash,
        phoneKeyVersion: keyVersion,
      },
    });
    console.log(`  owner "${def.owner.name}" criado (${owner.id})`);
  } else {
    console.log(`  owner "${def.owner.name}" já existia (${owner.id})`);
  }

  await prisma.userRole.upsert({
    where: {
      userId_role_scopeType_scopeId: {
        userId: owner.id,
        role: 'owner',
        scopeType: 'tenant',
        scopeId: tenant.id,
      },
    },
    update: {},
    create: { userId: owner.id, role: 'owner', scopeType: 'tenant', scopeId: tenant.id },
  });

  for (const moduleKey of entitledModules(def.plan)) {
    await prisma.tenantEntitlement.upsert({
      where: { tenantId_moduleKey: { tenantId: tenant.id, moduleKey } },
      update: { source: 'plan', status: 'active', deletedAt: null },
      create: { tenantId: tenant.id, moduleKey, source: 'plan', status: 'active' },
    });
  }

  const enabledDefaults = new Set(enabledByDefaultModules(def.plan));
  for (const moduleKey of entitledModules(def.plan)) {
    await prisma.tenantSetting.upsert({
      where: { tenantId_moduleKey: { tenantId: tenant.id, moduleKey } },
      update: { enabled: enabledDefaults.has(moduleKey), deletedAt: null },
      create: { tenantId: tenant.id, moduleKey, enabled: enabledDefaults.has(moduleKey) },
    });
  }

  console.log(
    `  ${entitledModules(def.plan).length} entitlements, ${enabledDefaults.size} ligados por padrão`,
  );

  return { tenantId: tenant.id, storeId: store.id };
}

/**
 * Épico 4 nunca teve unique key pra categoria/produto/grupo/modificador
 * (nome não é `@unique` — dois produtos podem ter o mesmo nome em categorias
 * diferentes) — mesmo padrão de `seedTenant()`: findFirst+create/update, não
 * upsert(). `sortOrder` vem da posição no array de `catalog.ts` (ordem
 * importa pro cardápio, não é alfabética).
 */
async function seedCatalog(
  prisma: PrismaClient,
  tenantId: string,
  tenantSlug: string,
  categories: readonly SeedCategoryDef[],
  photoContext: PhotoUploadContext | null,
  credits: Map<string, PhotoCreditRecord>,
) {
  for (const [categoryIndex, categoryDef] of categories.entries()) {
    let category = await prisma.category.findFirst({
      where: { tenantId, name: categoryDef.name, deletedAt: null },
    });
    const categoryData = { tenantId, name: categoryDef.name, sortOrder: categoryIndex, visible: true };
    category = category
      ? await prisma.category.update({ where: { id: category.id }, data: categoryData })
      : await prisma.category.create({ data: categoryData });

    for (const [productIndex, productDef] of categoryDef.products.entries()) {
      let product = await prisma.product.findFirst({
        where: { tenantId, categoryId: category.id, name: productDef.name, deletedAt: null },
      });

      // Produto já tem foto? Pula — nunca rebaixa nem re-upa. Só busca pra
      // produto novo ou pra quem ficou com `imageKey: null` (inclusive de uma
      // tentativa anterior que falhou — vale re-tentar no próximo run).
      let imageKey: string | null = product?.imageKey ?? null;
      if (!imageKey && photoContext) {
        await sleep(200); // 200 req/hora no plano gratuito da Pexels — só antes de busca real.
        const result = await fetchAndUploadProductPhoto(photoContext, {
          tenantId,
          tenantSlug,
          productName: productDef.name,
          searchTerm: productDef.photoSearchTerm,
        });
        if (result) {
          imageKey = result.imageKey;
          credits.set(result.imageKey, result.credit);
          console.log(`  [foto] "${productDef.name}" ← "${productDef.photoSearchTerm}"`);
        }
      }

      const productData = {
        tenantId,
        categoryId: category.id,
        name: productDef.name,
        description: productDef.description,
        basePriceCents: productDef.basePriceCents,
        imageKey,
        available: productDef.available,
        sortOrder: productIndex,
      };
      product = product
        ? await prisma.product.update({ where: { id: product.id }, data: productData })
        : await prisma.product.create({ data: productData });

      for (const groupDef of productDef.modifierGroups ?? []) {
        let group = await prisma.modifierGroup.findFirst({
          where: { tenantId, productId: product.id, name: groupDef.name, deletedAt: null },
        });
        const groupData = {
          tenantId,
          productId: product.id,
          name: groupDef.name,
          min: groupDef.min,
          max: groupDef.max,
        };
        group = group
          ? await prisma.modifierGroup.update({ where: { id: group.id }, data: groupData })
          : await prisma.modifierGroup.create({ data: groupData });

        for (const modifierDef of groupDef.modifiers) {
          const existingModifier = await prisma.modifier.findFirst({
            where: { tenantId, groupId: group.id, name: modifierDef.name, deletedAt: null },
          });
          const modifierData = {
            tenantId,
            groupId: group.id,
            name: modifierDef.name,
            priceDeltaCents: modifierDef.priceDeltaCents,
          };
          if (existingModifier) {
            await prisma.modifier.update({ where: { id: existingModifier.id }, data: modifierData });
          } else {
            await prisma.modifier.create({ data: modifierData });
          }
        }
      }
    }

    console.log(`  categoria "${categoryDef.name}": ${categoryDef.products.length} produtos`);
  }
}

/**
 * `null` se faltar `PEXELS_API_KEY` OU credenciais R2 (mesmo critério de
 * `StorageModule.STORAGE_PROVIDER` em apps/api — sem `S3_ACCESS_KEY_ID`, não
 * tem pra onde subir a foto). Cliente S3 aqui é standalone (ver comentário em
 * photos.ts sobre por que não reusa `R2StorageProvider`).
 */
function buildPhotoContext(): PhotoUploadContext | null {
  const apiKey = process.env.PEXELS_API_KEY;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  if (!apiKey || !accessKeyId) return null;

  const s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? '',
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' },
  });

  return { apiKey, s3Client, bucket: process.env.S3_BUCKET ?? '' };
}

/**
 * Turno não tem nome/identificador natural — a chave de idempotência é
 * (tenantId, storeId, dayOfWeek, opensAtMinutes). Sem geo/Unsupported
 * envolvido aqui, Prisma Client normal serve (ao contrário de zonas).
 */
async function seedStoreHours(
  prisma: PrismaClient,
  tenantId: string,
  storeId: string,
  shifts: readonly SeedShiftDef[],
) {
  // Limpa e recria (não upsert linha-a-linha): o dia fechado é RELATIVO ao dia
  // do seed (ver delivery.ts), então re-rodar em outro dia da semana muda QUAL
  // dia é fechado. Upsert sem prune deixaria linhas do dia que virou fechado —
  // loja aberta quando deveria estar fechada. Hard delete é ok: seed roda como
  // app_migrator, e store_hours é dado de seed regenerável.
  await prisma.storeHours.deleteMany({ where: { tenantId, storeId } });
  for (const shift of shifts) {
    await prisma.storeHours.create({
      data: {
        tenantId,
        storeId,
        dayOfWeek: shift.dayOfWeek,
        opensAtMinutes: shift.opensAtMinutes,
        closesAtMinutes: shift.closesAtMinutes,
      },
    });
  }
}

/**
 * `polygon` é Unsupported (geography) — INSERT/UPDATE só via SQL cru.
 * ST_Buffer num geography faz buffer geodésico (metros de verdade, não
 * plano cartesiano) a partir do Store.geo já gravado por `seedTenant()`.
 */
async function seedDeliveryZones(
  prisma: PrismaClient,
  tenantId: string,
  storeId: string,
  zones: readonly SeedZoneDef[],
) {
  for (const zone of zones) {
    const existing = await prisma.deliveryZone.findFirst({
      where: { tenantId, storeId, name: zone.name, deletedAt: null },
    });

    if (existing) {
      await prisma.$executeRaw`
        UPDATE delivery_zones
        SET polygon = ST_Buffer((SELECT geo FROM stores WHERE id = ${storeId}::uuid), ${zone.radiusMeters}),
            fee_cents = ${zone.feeCents},
            eta_min_minutes = ${zone.etaMinMinutes},
            eta_max_minutes = ${zone.etaMaxMinutes},
            priority = ${zone.priority},
            updated_at = now()
        WHERE id = ${existing.id}::uuid
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO delivery_zones
          (tenant_id, store_id, name, polygon, fee_cents, eta_min_minutes, eta_max_minutes, priority)
        VALUES (
          ${tenantId}::uuid,
          ${storeId}::uuid,
          ${zone.name},
          ST_Buffer((SELECT geo FROM stores WHERE id = ${storeId}::uuid), ${zone.radiusMeters}),
          ${zone.feeCents},
          ${zone.etaMinMinutes},
          ${zone.etaMaxMinutes},
          ${zone.priority}
        )
      `;
    }
  }
}

async function seedDelivery(prisma: PrismaClient, tenantId: string, storeId: string, def: SeedDeliveryDef) {
  await seedStoreHours(prisma, tenantId, storeId, def.shifts);
  await seedDeliveryZones(prisma, tenantId, storeId, def.zones);
  console.log(`  ${def.shifts.length} turnos, ${def.zones.length} zona(s)`);
}

async function main() {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) throw new Error('DIRECT_URL não configurada — seed roda como app_migrator');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: directUrl }) });
  const photoContext = buildPhotoContext();
  if (!photoContext) {
    console.log('\nPEXELS_API_KEY ou credenciais R2 ausentes — produtos novos ficam com imageKey null (placeholder do tema).');
  }
  const credits = loadPhotoCredits();

  try {
    console.log('planos:');
    for (const plan of SEED_PLANS) {
      await prisma.plan.upsert({
        where: { id: plan.id },
        update: { name: plan.name, priceMonthCents: plan.priceMonthCents },
        create: {
          id: plan.id,
          name: plan.name,
          priceMonthCents: plan.priceMonthCents,
          modules: defaultModulesForPlan(plan.id),
        },
      });
      console.log(`  ${plan.id}`);
    }

    for (const def of SEED_TENANTS) {
      console.log(`\nseed: ${def.name} (${def.slug})`);
      await seedTenant(prisma, def);
    }

    console.log('\ncardápio:');
    for (const catalogDef of SEED_CATALOGS) {
      const tenant = await prisma.tenant.findFirst({
        where: { slug: catalogDef.tenantSlug, deletedAt: null },
      });
      if (!tenant) throw new Error(`tenant "${catalogDef.tenantSlug}" não encontrado — seed de tenants rodou?`);

      console.log(`  ${catalogDef.tenantSlug}:`);
      await seedCatalog(prisma, tenant.id, catalogDef.tenantSlug, catalogDef.categories, photoContext, credits);
    }

    if (photoContext) {
      savePhotoCredits(credits);
      console.log(`\nfotos: ${credits.size} crédito(s) em photo-credits.json`);
    }

    console.log('\nzonas de entrega e horário:');
    for (const deliveryDef of SEED_DELIVERY) {
      const tenant = await prisma.tenant.findFirst({
        where: { slug: deliveryDef.tenantSlug, deletedAt: null },
      });
      if (!tenant) throw new Error(`tenant "${deliveryDef.tenantSlug}" não encontrado — seed de tenants rodou?`);

      // Mesma suposição de findStore() em apps/api: uma loja por tenant no MVP.
      const store = await prisma.store.findFirst({
        where: { tenantId: tenant.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!store) throw new Error(`loja do tenant "${deliveryDef.tenantSlug}" não encontrada — seed de tenants rodou?`);

      console.log(`  ${deliveryDef.tenantSlug}:`);
      await seedDelivery(prisma, tenant.id, store.id, deliveryDef);
    }

    console.log('\npedidos de exemplo (gestor):');
    {
      const tenant = await prisma.tenant.findFirst({ where: { slug: 'hamburgueria-da-vila', deletedAt: null } });
      const store = tenant
        ? await prisma.store.findFirst({ where: { tenantId: tenant.id, deletedAt: null }, orderBy: { createdAt: 'asc' } })
        : null;
      if (tenant && store) await seedOrders(prisma, tenant.id, store.id);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\nseed concluído.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('seed falhou:', error);
    process.exit(1);
  });
