-- Épico 4E — expande as opções de complemento sem alterar o comportamento
-- das linhas existentes. Todos os defaults preservam a leitura antiga.

ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "image_key" TEXT;
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "pdv_code" TEXT;
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "modifiers_tenant_id_group_id_sort_order_idx"
  ON "modifiers"("tenant_id", "group_id", "sort_order");
