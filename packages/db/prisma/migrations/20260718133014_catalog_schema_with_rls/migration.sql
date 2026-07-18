-- Nota: falso drift de updated_at DROP DEFAULT (as 8 linhas que o Prisma
-- gerou pras tabelas existentes) removido de propósito — mesmo achado do
-- Épico 2/3, documentado em CLAUDE.md. @updatedAt não vira DEFAULT de banco;
-- o DEFAULT é rede de segurança pra escrita fora do Prisma Client.

-- ─── Tabelas ─────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE IF NOT EXISTS "categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "products" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_price_cents" INTEGER NOT NULL,
    "image_key" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "modifier_groups" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min" INTEGER NOT NULL DEFAULT 0,
    "max" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "modifiers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_delta_cents" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- Mesma rede de segurança do Épico 2/3 (@updatedAt não vira DEFAULT sozinho
-- no schema.prisma) — escrita em SQL cru (seed, fix manual) ainda precisa
-- de um valor pra updated_at.
ALTER TABLE "categories" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "products" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "modifier_groups" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "modifiers" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- CreateIndex — tenant_id sempre primeiro em índice composto (CLAUDE.md).
CREATE INDEX IF NOT EXISTS "categories_tenant_id_sort_order_idx" ON "categories"("tenant_id", "sort_order");
CREATE INDEX IF NOT EXISTS "products_tenant_id_category_id_sort_order_idx" ON "products"("tenant_id", "category_id", "sort_order");
CREATE INDEX IF NOT EXISTS "modifier_groups_tenant_id_product_id_idx" ON "modifier_groups"("tenant_id", "product_id");
CREATE INDEX IF NOT EXISTS "modifiers_tenant_id_group_id_idx" ON "modifiers"("tenant_id", "group_id");

-- ─── Alvos de FK composta ────────────────────────────────────────────────────
-- Postgres exige unique/PK exatamente nas colunas referenciadas por uma FK
-- composta. id já é PK (único sozinho); este índice adiciona (id, tenant_id)
-- como alvo, sem enfraquecer a unicidade de id.
CREATE UNIQUE INDEX IF NOT EXISTS "categories_id_tenant_id_key" ON "categories"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "products_id_tenant_id_key" ON "products"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "modifier_groups_id_tenant_id_key" ON "modifier_groups"("id", "tenant_id");

-- ─── Foreign keys simples (tenant_id → tenants) ──────────────────────────────

DO $$ BEGIN
  ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Foreign keys compostas (guardrail contra tenant_id inconsistente) ──────
-- (filho_id, tenant_id) → (pai.id, pai.tenant_id): impede fisicamente, no
-- banco, um filho apontar pra um pai de OUTRO tenant — sem trigger, sem
-- overhead de runtime. Nunca a FK simples (só filho_id → pai.id) pra essas
-- 3 bordas, de propósito.

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_category_id_tenant_id_fkey" FOREIGN KEY ("category_id", "tenant_id") REFERENCES "categories"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_product_id_tenant_id_fkey" FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_group_id_tenant_id_fkey" FOREIGN KEY ("group_id", "tenant_id") REFERENCES "modifier_groups"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks de negócio ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_base_price_cents_check" CHECK ("base_price_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_min_max_check" CHECK ("min" >= 0 AND "min" <= "max");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_price_delta_cents_check" CHECK ("price_delta_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS: tenant-scoped, mutável — mesma família de stores/customers ───────

ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "categories";
CREATE POLICY tenant_isolation ON "categories"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "products";
CREATE POLICY tenant_isolation ON "products"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "modifier_groups" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "modifier_groups";
CREATE POLICY tenant_isolation ON "modifier_groups"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "modifiers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "modifiers";
CREATE POLICY tenant_isolation ON "modifiers"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

-- Grant de tabela nova — ALTER DEFAULT PRIVILEGES da migration `init` já
-- cobre isto automaticamente, mas explícito documenta a intenção aqui
-- também (mesmo padrão da migration de customers).
GRANT SELECT, INSERT, UPDATE, DELETE ON "categories" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "products" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "modifier_groups" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "modifiers" TO app_runtime;
