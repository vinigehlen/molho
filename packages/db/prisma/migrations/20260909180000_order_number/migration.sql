-- Numeração sequencial de pedido POR TENANT — #00001, #00002, ... lifetime
-- (não reseta). Cada pedido fica único e identificável dentro do tenant.
--
-- Atribuída por trigger BEFORE INSERT em `orders`: pega checkout, balcão e
-- qualquer caminho futuro sem tocar em cada repo. Serializa por tenant na linha
-- do contador — ok no piloto; revisar se um tenant fizer dezenas de pedidos/s.
--
-- Idempotente (o shadow database do `prisma migrate dev` replaya tudo).

-- ─── Coluna ──────────────────────────────────────────────────────────────────
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "order_number" INTEGER;

-- ─── Contador por tenant ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "order_number_counters" (
  "tenant_id" UUID NOT NULL,
  -- próximo número a ATRIBUIR (o trigger devolve next_number - 1 e incrementa).
  "next_number" INTEGER NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("tenant_id")
);

DO $$ BEGIN
  ALTER TABLE "order_number_counters" ADD CONSTRAINT "order_number_counters_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "order_number_counters" ADD CONSTRAINT "order_number_counters_next_check" CHECK ("next_number" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Backfill dos pedidos existentes ─────────────────────────────────────────
-- Numera por (tenant, created_at, id). Roda como app_migrator (dono de orders,
-- isento de RLS — orders tem ENABLE, não FORCE).
WITH numbered AS (
  SELECT "id", row_number() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id") AS n
  FROM "orders"
  WHERE "order_number" IS NULL
)
UPDATE "orders" o SET "order_number" = numbered.n
FROM numbered WHERE o."id" = numbered."id";

-- Semente do contador: próximo = maior número atual + 1 (ou 1 se sem pedido).
INSERT INTO "order_number_counters" ("tenant_id", "next_number")
SELECT t."id", COALESCE((SELECT max(o."order_number") FROM "orders" o WHERE o."tenant_id" = t."id"), 0) + 1
FROM "tenants" t
ON CONFLICT ("tenant_id") DO NOTHING;

-- ─── Trigger de atribuição ───────────────────────────────────────────────────
-- INSERT ... ON CONFLICT DO UPDATE serializa concorrentes na linha do contador
-- (o 2º espera o 1º commitar). `next_number - 1` = número deste pedido:
--   - tenant sem contador ainda (criado após esta migration): VALUES (t, 2) →
--     devolve 1, contador fica em 2.
--   - tenant com contador em N: UPDATE → N+1, devolve N.
CREATE OR REPLACE FUNCTION assign_order_number() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."order_number" IS NULL THEN
    INSERT INTO "order_number_counters" AS c ("tenant_id", "next_number")
      VALUES (NEW."tenant_id", 2)
    ON CONFLICT ("tenant_id") DO UPDATE
      SET "next_number" = c."next_number" + 1, "updated_at" = now()
    RETURNING c."next_number" - 1 INTO NEW."order_number";
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_assign_number ON "orders";
CREATE TRIGGER orders_assign_number
  BEFORE INSERT ON "orders"
  FOR EACH ROW EXECUTE FUNCTION assign_order_number();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- ENABLE, não FORCE (igual a `orders`): o dono (app_migrator) precisa
-- semear/depurar sem contexto de tenant. O trigger sempre usa NEW.tenant_id,
-- que num INSERT válido de pedido já casa com app.tenant_id (a policy de
-- `orders` barra o descasamento antes).
ALTER TABLE "order_number_counters" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "order_number_counters";
CREATE POLICY tenant_isolation ON "order_number_counters"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE ON "order_number_counters" TO app_runtime;
