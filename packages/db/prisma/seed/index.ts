import {
  MODULE_KEYS,
  type ModuleKey,
  defaultModulesForPlan,
  moduleDef,
  planGrants,
} from '@molho/contracts';
import { PrismaPg } from '@prisma/adapter-pg';
import { encryptPhone, hashPhoneForLookup } from '../../src/crypto/phone';
import { PrismaClient } from '../generated/client/client';
import { type SeedCategoryDef, SEED_CATALOGS } from './catalog';
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

async function seedTenant(prisma: PrismaClient, def: SeedTenantDef) {
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
  };
  if (existingStore) {
    await prisma.store.update({ where: { id: existingStore.id }, data: storeData });
  } else {
    await prisma.store.create({ data: storeData });
  }

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
  categories: readonly SeedCategoryDef[],
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
      const productData = {
        tenantId,
        categoryId: category.id,
        name: productDef.name,
        description: productDef.description,
        basePriceCents: productDef.basePriceCents,
        // Sem PEXELS_API_KEY, não há foto real pra buscar — null é o
        // fallback determinístico (resolvePublicImageUrl degrada pro
        // placeholder do tema), nunca uma chave inventada apontando pra um
        // objeto que não existe no R2.
        imageKey: null,
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

async function main() {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) throw new Error('DIRECT_URL não configurada — seed roda como app_migrator');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: directUrl }) });

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
      await seedCatalog(prisma, tenant.id, catalogDef.categories);
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
