-- Exceção MVP 2026-08-28 (combos, ver CLAUDE.md) — fase 4/4 (fatia 4.1b):
-- tabela order_item_components. Snapshot dos filhos de um combo no pedido —
-- append-only, mesmo tratamento de order_item_modifiers. Não entra no
-- cálculo de preço (combo é preço fixo na fase 4.1).
--
-- Escrita à mão (mesmo motivo das fases anteriores, docs/07): migrations/
-- local está atrás do banco dev real. Idempotente. Aditiva — nenhuma tabela
-- existente muda.

CREATE TABLE IF NOT EXISTS "order_item_components" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "child_product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_components_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "order_item_components" ADD CONSTRAINT "order_item_components_quantity_check" CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "order_item_components_tenant_id_order_item_id_idx"
  ON "order_item_components"("tenant_id", "order_item_id");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "order_item_components" ADD CONSTRAINT "order_item_components_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Compostas: componente nunca aponta pra order_item / produto de outro
-- tenant. order_items(id, tenant_id) e products(id, tenant_id) já existem
-- como alvo (Épico 4/7).
DO $$ BEGIN
  ALTER TABLE "order_item_components" ADD CONSTRAINT "order_item_components_order_item_id_tenant_id_fkey" FOREIGN KEY ("order_item_id", "tenant_id") REFERENCES "order_items"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_item_components" ADD CONSTRAINT "order_item_components_child_product_id_tenant_id_fkey" FOREIGN KEY ("child_product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS: tenant-scoped, append-only — mesma família de order_item_modifiers ──

ALTER TABLE "order_item_components" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "order_item_components";
CREATE POLICY tenant_isolation ON "order_item_components"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT ON "order_item_components" TO app_runtime;
