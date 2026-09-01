-- 4.2B: personalização mínima de combo — cliente pode remover filhos
-- marcados pelo lojista como removíveis. Aditiva e idempotente.

ALTER TABLE "combo_items"
  ADD COLUMN IF NOT EXISTS "removable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "order_item_components"
  ADD COLUMN IF NOT EXISTS "removed" BOOLEAN NOT NULL DEFAULT false;
