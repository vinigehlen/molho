-- Épico conversão (C1) — múltiplas fotos por produto.
-- docs/handoff-features-conversao-gestor.md A1.
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).
--
-- ATENÇÃO — se esta migration for regenerada via `prisma migrate dev
-- --create-only`, o Prisma também vai propor o bloco de falso drift já
-- documentado no CLAUDE.md (DROP das FKs compostas/índices únicos parciais
-- que schema.prisma não expressa) — ARRANCAR À MÃO, nunca aplicar.

-- ─── Tabela product_images ───────────────────────────────────────────────────
--
-- Tabela (não array em Product) pela ordenação (`position`) e pra não inflar
-- a row do produto. `position = 0` é a CAPA — é o que Product.imageKey e
-- storefrontProductSchema.imageUrl expõem pra compat, até o storefront
-- consumir a galeria inteira.

CREATE TABLE IF NOT EXISTS "product_images" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "image_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- tenant_id sempre primeiro em índice composto (CLAUDE.md). Cobre a query
-- "galeria de UM produto, em ordem".
CREATE INDEX IF NOT EXISTS "product_images_tenant_id_product_id_position_idx" ON "product_images"("tenant_id", "product_id", "position");

-- Alvo de FK composta (guardrail contra tenant_id inconsistente) — mesmo
-- padrão de products_id_tenant_id_key/modifier_groups_id_tenant_id_key.
CREATE UNIQUE INDEX IF NOT EXISTS "product_images_id_tenant_id_key" ON "product_images"("id", "tenant_id");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Composta: uma foto não pode apontar pra produto de OUTRO tenant, mesmo com
-- bug de aplicação. products(id, tenant_id) já existe como alvo (Épico 4).
DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_tenant_id_fkey" FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks de negócio ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_position_check" CHECK ("position" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS: tenant-scoped, mutável — mesma família de products/modifiers ──────

ALTER TABLE "product_images" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "product_images";
CREATE POLICY tenant_isolation ON "product_images"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "product_images" TO app_runtime;

-- ─── Data migration: foto única existente vira position=0 ──────────────────
--
-- Só produtos vivos com image_key preenchido. `NOT EXISTS` torna o replay
-- seguro (shadow database roda esta migration várias vezes por invocação,
-- CLAUDE.md) — sem isso, rodar duas vezes duplicaria a capa de cada produto.
INSERT INTO "product_images" ("tenant_id", "product_id", "image_key", "position")
SELECT p."tenant_id", p."id", p."image_key", 0
FROM "products" p
WHERE p."image_key" IS NOT NULL
  AND p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "product_images" pi
    WHERE pi."product_id" = p."id" AND pi."position" = 0 AND pi."deleted_at" IS NULL
  );
