-- Exceção MVP 2026-08-28 (combos, ver CLAUDE.md) — fase 2/4: grupo de
-- complemento REUTILIZÁVEL entre produtos. `modifier_groups.product_id`
-- continua sendo o dono/criador; esta tabela é a lista real de "em quais
-- produtos o grupo vale". Backfill garante que todo grupo já tenha pelo
-- menos uma linha aqui (o próprio productId original), então "grupos deste
-- produto" pode migrar pra consultar SÓ esta tabela sem perder nada.
--
-- Escrita à mão (mesmo motivo da fase 1, docs/07): migrations/ local está
-- atrás de uma migration já aplicada no banco real. Idempotente.

CREATE TABLE IF NOT EXISTS "product_modifier_groups" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "product_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "product_modifier_groups_tenant_id_product_id_idx" ON "product_modifier_groups"("tenant_id", "product_id");
CREATE INDEX IF NOT EXISTS "product_modifier_groups_tenant_id_modifier_group_id_idx" ON "product_modifier_groups"("tenant_id", "modifier_group_id");

-- Um mesmo grupo não pode ser vinculado duas vezes ao mesmo produto — parcial
-- (WHERE deleted_at IS NULL) pra desvincular e revincular depois não travar
-- no valor antigo (CLAUDE.md § convenções de schema).
CREATE UNIQUE INDEX IF NOT EXISTS "product_modifier_groups_product_group_key"
  ON "product_modifier_groups"("product_id", "modifier_group_id")
  WHERE "deleted_at" IS NULL;

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Compostas: um vínculo não pode apontar pra produto/grupo de OUTRO tenant,
-- mesmo com bug de aplicação. products(id, tenant_id) e
-- modifier_groups(id, tenant_id) já existem como alvo (Épico 4/commit 1).
DO $$ BEGIN
  ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_product_id_tenant_id_fkey" FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_modifier_group_id_tenant_id_fkey" FOREIGN KEY ("modifier_group_id", "tenant_id") REFERENCES "modifier_groups"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS: tenant-scoped, mutável — mesma família de products/modifier_groups ─

ALTER TABLE "product_modifier_groups" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "product_modifier_groups";
CREATE POLICY tenant_isolation ON "product_modifier_groups"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "product_modifier_groups" TO app_runtime;

-- ─── Data migration: backfill do vínculo original (product_id do grupo) ─────
--
-- `NOT EXISTS` torna o replay seguro (shadow database roda esta migration
-- várias vezes por invocação) — sem isso, rodar duas vezes duplicaria o
-- vínculo de cada grupo.
INSERT INTO "product_modifier_groups" ("tenant_id", "product_id", "modifier_group_id")
SELECT mg."tenant_id", mg."product_id", mg."id"
FROM "modifier_groups" mg
WHERE mg."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "product_modifier_groups" pmg
    WHERE pmg."modifier_group_id" = mg."id" AND pmg."product_id" = mg."product_id" AND pmg."deleted_at" IS NULL
  );
