-- Nota: o `prisma migrate dev` gerado originalmente tentou DROPar as FKs
-- compostas e os índices únicos parciais de categories/products/modifier_groups
-- (existem só em SQL manual, não no schema.prisma — mesmo "falso drift"
-- documentado em CLAUDE.md) e re-adicionar FK simples no lugar. Removido à
-- mão. Removido também o DROP DEFAULT de updated_at nas 12 tabelas
-- existentes (mesmo achado do Épico 2/3/4: @updatedAt não vira DEFAULT de
-- banco, o DEFAULT é rede de segurança pra escrita fora do Prisma Client).

-- ─── Tabelas ─────────────────────────────────────────────────────────────────

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DayOfWeek" AS ENUM ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "addresses" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Endereço',
    "street" TEXT NOT NULL,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal_code" TEXT,
    "reference_point" TEXT,
    "geo" geography(Point, 4326) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "delivery_zones" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" geography(Polygon, 4326) NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    "eta_min_minutes" INTEGER NOT NULL,
    "eta_max_minutes" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "store_hours" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "opens_at_minutes" INTEGER NOT NULL,
    "closes_at_minutes" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "store_hours_pkey" PRIMARY KEY ("id")
);

-- Mesma rede de segurança do Épico 2/3/4 (@updatedAt não vira DEFAULT
-- sozinho no schema.prisma) — escrita em SQL cru (seed, fix manual) ainda
-- precisa de um valor pra updated_at.
ALTER TABLE "addresses" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "delivery_zones" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "store_hours" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- CreateIndex — tenant_id sempre primeiro em índice composto (CLAUDE.md).
CREATE INDEX IF NOT EXISTS "addresses_tenant_id_customer_id_idx" ON "addresses"("tenant_id", "customer_id");
CREATE INDEX IF NOT EXISTS "delivery_zones_tenant_id_store_id_idx" ON "delivery_zones"("tenant_id", "store_id");
CREATE INDEX IF NOT EXISTS "store_hours_tenant_id_store_id_day_of_week_idx" ON "store_hours"("tenant_id", "store_id", "day_of_week");

-- GiST — obrigatório pra ST_Contains/ST_DWithin não fazer sequential scan
-- (Prisma DSL não expressa tipo de índice espacial, vai à mão).
CREATE INDEX IF NOT EXISTS "delivery_zones_polygon_gist_idx" ON "delivery_zones" USING GIST ("polygon");

-- ─── Alvos de FK composta ────────────────────────────────────────────────────
-- customers e stores nunca precisaram de (id, tenant_id) até agora — nada
-- tinha FK composta pra eles. addresses ganha o dela agora também, de
-- propósito: orders.delivery_address_id (Épico 7) vai precisar.
CREATE UNIQUE INDEX IF NOT EXISTS "customers_id_tenant_id_key" ON "customers"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "stores_id_tenant_id_key" ON "stores"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "addresses_id_tenant_id_key" ON "addresses"("id", "tenant_id");

-- ─── Foreign keys simples (tenant_id → tenants) ──────────────────────────────

DO $$ BEGIN
  ALTER TABLE "addresses" ADD CONSTRAINT "addresses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Foreign keys compostas (guardrail contra tenant_id inconsistente) ──────
-- (filho_id, tenant_id) → (pai.id, pai.tenant_id): impede fisicamente, no
-- banco, um filho apontar pra um pai de OUTRO tenant — mesmo padrão do
-- Épico 4 (products→categories etc). Nunca a FK simples pra essas bordas.

DO $$ BEGIN
  ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_tenant_id_fkey" FOREIGN KEY ("customer_id", "tenant_id") REFERENCES "customers"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_store_id_tenant_id_fkey" FOREIGN KEY ("store_id", "tenant_id") REFERENCES "stores"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_store_id_tenant_id_fkey" FOREIGN KEY ("store_id", "tenant_id") REFERENCES "stores"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks de negócio ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_fee_cents_check" CHECK ("fee_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_eta_check" CHECK ("eta_min_minutes" >= 0 AND "eta_max_minutes" >= "eta_min_minutes");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_priority_check" CHECK ("priority" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Minutos desde meia-noite: 0..1439. closes <> opens (turno de duração zero
-- não existe) — closes < opens é o código pra "atravessa meia-noite", ver
-- comentário no model StoreHours.
DO $$ BEGIN
  ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_opens_at_range_check" CHECK ("opens_at_minutes" >= 0 AND "opens_at_minutes" <= 1439);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_closes_at_range_check" CHECK ("closes_at_minutes" >= 0 AND "closes_at_minutes" <= 1439);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_opens_closes_distinct_check" CHECK ("opens_at_minutes" <> "closes_at_minutes");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS: tenant-scoped, mutável — mesma família de stores/categories ──────

ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "addresses";
CREATE POLICY tenant_isolation ON "addresses"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "delivery_zones" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "delivery_zones";
CREATE POLICY tenant_isolation ON "delivery_zones"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "store_hours" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "store_hours";
CREATE POLICY tenant_isolation ON "store_hours"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

-- Grant de tabela nova — ALTER DEFAULT PRIVILEGES da migration `init` já
-- cobre isto automaticamente, mas explícito documenta a intenção aqui
-- também (mesmo padrão das migrations anteriores).
GRANT SELECT, INSERT, UPDATE, DELETE ON "addresses" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "delivery_zones" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "store_hours" TO app_runtime;
