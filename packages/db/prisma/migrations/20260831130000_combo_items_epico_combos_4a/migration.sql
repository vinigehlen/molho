-- Exceção MVP 2026-08-28 (combos, ver CLAUDE.md) — fase 4/4 (fatia 4.1a):
-- tabela combo_items. O combo É um Product com kind = 'combo' (fase 3); esta
-- tabela só diz quais produtos do catálogo vêm dentro e em que quantidade.
-- Aditiva, zero risco pro checkout — nenhuma tabela existente muda; combo
-- ainda não é wireado no checkout (fatia 4.1b).
--
-- Escrita à mão (mesmo motivo das fases 1/2/3, docs/07): migrations/ local
-- está atrás de migrations já aplicadas no banco real. Idempotente.

CREATE TABLE IF NOT EXISTS "combo_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "combo_product_id" UUID NOT NULL,
    "child_product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id")
);

-- ─── CHECKs ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_quantity_check" CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Combo não se contém (evita loop trivial). Combo aninhado (filho kind =
-- 'combo') é barrado na APLICAÇÃO — fase 4.1a não precisa disso no banco.
DO $$ BEGIN
  ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_no_self_reference_check" CHECK ("combo_product_id" <> "child_product_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "combo_items_tenant_id_combo_product_id_sort_order_idx"
  ON "combo_items"("tenant_id", "combo_product_id", "sort_order");
CREATE INDEX IF NOT EXISTS "combo_items_tenant_id_child_product_id_idx"
  ON "combo_items"("tenant_id", "child_product_id");

-- Um mesmo produto-filho não entra duas vezes no mesmo combo — parcial pra
-- remover e re-adicionar depois não travar no valor antigo (CLAUDE.md
-- § convenções de schema).
CREATE UNIQUE INDEX IF NOT EXISTS "combo_items_combo_child_key"
  ON "combo_items"("combo_product_id", "child_product_id")
  WHERE "deleted_at" IS NULL;

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Compostas: combo e filho nunca de outro tenant, mesmo com bug de
-- aplicação. products(id, tenant_id) já existe como alvo (Épico 4).
DO $$ BEGIN
  ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_product_id_tenant_id_fkey" FOREIGN KEY ("combo_product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_child_product_id_tenant_id_fkey" FOREIGN KEY ("child_product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS: tenant-scoped, mutável — mesma família de products ──────────────────

ALTER TABLE "combo_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "combo_items";
CREATE POLICY tenant_isolation ON "combo_items"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "combo_items" TO app_runtime;
