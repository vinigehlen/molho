-- Toda instrução escrita à mão nesta migration é idempotente por
-- construção — `prisma migrate dev` faz múltiplas passadas de replay no
-- shadow database dentro de UMA única invocação, e seu reset entre passadas
-- só limpa o que ele reconhece do schema.prisma (tabelas, enums); função,
-- policy etc. escritos à mão sobrevivem e colidem numa 2ª passada se não
-- forem re-executáveis. Ver CLAUDE.md § Convenções de schema (Postgres).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EntitlementSource" AS ENUM ('plan', 'addon', 'manual', 'trial');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EntitlementStatus" AS ENUM ('active', 'trialing', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ScopeType" AS ENUM ('platform', 'franchise', 'tenant', 'store');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_month_cents" INTEGER NOT NULL,
    "modules" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "feature_flags" (
    "key" TEXT NOT NULL,
    "rollout_pct" INTEGER NOT NULL DEFAULT 0,
    "tenant_allowlist" UUID[] DEFAULT ARRAY[]::UUID[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tenant_entitlements" (
    "tenant_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "source" "EntitlementSource" NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'active',
    "trial_ends_at" TIMESTAMP(3),
    "limits" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenant_entitlements_pkey" PRIMARY KEY ("tenant_id","module_key")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id","module_key")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "module_audit" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tenants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "plan_id" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "theme_key" TEXT NOT NULL DEFAULT 'roxo',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stores" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address_text" TEXT NOT NULL,
    "geo" geography(Point, 4326),
    "timezone" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp_number" TEXT,
    "min_order_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "phone_ciphertext" BYTEA NOT NULL,
    "phone_lookup_hash" TEXT NOT NULL,
    "phone_key_version" INTEGER NOT NULL DEFAULT 1,
    "email" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_roles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "scope_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID,
    "actor_id" UUID NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "ip" INET,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "module_audit_tenant_id_at_idx" ON "module_audit"("tenant_id", "at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stores_tenant_id_idx" ON "stores"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_lookup_hash_key" ON "users"("phone_lookup_hash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_user_id_role_scope_type_scope_id_key" ON "user_roles"("user_id", "role", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_log_tenant_id_at_idx" ON "audit_log"("tenant_id", "at");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "module_audit" ADD CONSTRAINT "module_audit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "module_audit" ADD CONSTRAINT "module_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "stores" ADD CONSTRAINT "stores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── DEFAULT de banco pra updated_at ─────────────────────────────────────────
-- @updatedAt do Prisma só roda no Prisma Client (é comportamento de
-- aplicação, não vira DEFAULT/trigger na migration). Sem isto, qualquer
-- escrita fora do Prisma Client (seed em SQL cru, fix manual, este próprio
-- teste de RLS) quebra o NOT NULL. DEFAULT no banco é rede de segurança —
-- mesmo raciocínio de "RLS como última linha de defesa". SET DEFAULT já é
-- idempotente por natureza (reafirmar o mesmo default não erra).
ALTER TABLE "plans" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "feature_flags" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tenant_entitlements" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tenant_settings" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tenants" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "stores" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ═══════════════════════════════════════════════════════════════════════════
-- A partir daqui: SQL escrito à mão (RLS, roles, grants, PostGIS já habilitado
-- via bootstrap.sql). Nada disto é representável no schema.prisma.
--
-- Pré-requisito (rodado uma vez, fora desta migration, por um role admin do
-- Neon com neon_superuser — ver prisma/bootstrap.sql):
--   CREATE ROLE app_migrator LOGIN CREATEDB;
--   CREATE ROLE app_runtime LOGIN;
--   CREATE EXTENSION IF NOT EXISTS postgis;
--   GRANT USAGE, CREATE ON SCHEMA public TO app_migrator;
-- Esta migration roda conectada como app_migrator (DIRECT_URL) — por isso as
-- tabelas acima já nascem de propriedade dele, sem precisar de SET ROLE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Índice único parcial: slug só é único entre tenants vivos ──────────────
-- (soft delete — Prisma não expressa índice parcial no DSL)
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants" ("slug") WHERE "deleted_at" IS NULL;

-- ─── Hardening: PUBLIC não herda nada; app_runtime só tem o que é dado ──────
-- O REVOKE ALL ON SCHEMA public FROM PUBLIC e o GRANT USAGE ON SCHEMA public
-- TO app_runtime já rodaram em prisma/bootstrap.sql: são privilégio de nível
-- de SCHEMA, e app_migrator (que roda esta migration) não é dono do schema
-- `public` nem tem GRANT OPTION nele — rodar aqui seria um REVOKE/GRANT sem
-- efeito (Postgres aceita e não erra, mas ignora silenciosamente). O que
-- segue é grant de TABELA, que app_migrator PODE fazer por ser dono delas.
-- GRANT é idempotente por natureza — regrantar não erra.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;

-- Tabela nova criada numa migration futura (por app_migrator) já nasce com o
-- grant certo para app_runtime — sem isto, cada migration teria que lembrar
-- de conceder tabela por tabela, e uma esquecida fica invisível pro app.
-- ALTER DEFAULT PRIVILEGES também é idempotente — redeclarar não erra.
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;

-- ─── Predicado central de RLS ────────────────────────────────────────────────
-- STABLE (não IMMUTABLE): current_setting() muda entre requests/transações,
-- então o resultado não pode ser cravado por request. STABLE ainda permite o
-- planner cachear o valor DENTRO de uma mesma execução de query, então não
-- vira function call por linha — ver EXPLAIN no fim desta migration.
-- CREATE OR REPLACE: é o que sobrevive entre passadas de replay do shadow
-- (função não é derrubada pelo reset do Prisma, só tabela/enum são).
CREATE OR REPLACE FUNCTION app_tenant_visible(row_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT row_tenant_id = current_setting('app.tenant_id', true)::uuid
      OR current_setting('app.is_platform', true)::boolean IS TRUE
$$;

GRANT EXECUTE ON FUNCTION app_tenant_visible(uuid) TO app_runtime;

-- ─── RLS: tenant-scoped, mutável (ALL commands numa policy só) ──────────────
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "stores";
CREATE POLICY tenant_isolation ON "stores"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "tenant_entitlements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenant_entitlements";
CREATE POLICY tenant_isolation ON "tenant_entitlements"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenant_settings";
CREATE POLICY tenant_isolation ON "tenant_settings"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

-- ─── RLS: tenant-scoped, self-row (a linha É o tenant) ──────────────────────
-- Criar tenant (INSERT) exige app.is_platform=true — provisionamento é ação
-- de plataforma, nunca de um tenant se auto-criando.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenants";
CREATE POLICY tenant_isolation ON "tenants"
  USING (app_tenant_visible("id"))
  WITH CHECK (app_tenant_visible("id"));

-- ─── RLS: tenant-scoped, append-only (só SELECT/INSERT — sem policy de ──────
-- UPDATE/DELETE = o Postgres nega os dois por padrão; imutabilidade garantida
-- no banco, não só por convenção de aplicação)
ALTER TABLE "module_audit" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON "module_audit";
CREATE POLICY tenant_isolation_select ON "module_audit"
  FOR SELECT USING (app_tenant_visible("tenant_id"));
DROP POLICY IF EXISTS tenant_isolation_insert ON "module_audit";
CREATE POLICY tenant_isolation_insert ON "module_audit"
  FOR INSERT WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON "audit_log";
CREATE POLICY tenant_isolation_select ON "audit_log"
  FOR SELECT USING (app_tenant_visible("tenant_id"));
DROP POLICY IF EXISTS tenant_isolation_insert ON "audit_log";
CREATE POLICY tenant_isolation_insert ON "audit_log"
  FOR INSERT WITH CHECK (app_tenant_visible("tenant_id"));

-- ─── SEM RLS, de propósito ───────────────────────────────────────────────────
-- plans, feature_flags: dado global de plataforma, sem tenant_id — controle
--   é 100% RBAC de aplicação (platform.flags.manage etc.), não linha a linha.
-- users, user_roles: identidade global (platform_support e franquia atuam em
--   vários tenants), sem tenant_id — isolamento é convenção de query com
--   escopo explícito, documentado em CLAUDE.md. Não há policy pra criar aqui.
