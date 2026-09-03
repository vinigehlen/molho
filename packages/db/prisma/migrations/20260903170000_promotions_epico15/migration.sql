-- Épico 15 — promoções agendadas: desconto automático por dia da semana e
-- janela de horário local da loja, sem cupom digitado. Empilha com
-- cupom/cashback (colunas independentes, mesmo racional do Épico 16b).
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).

-- ─── Tipos ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PromotionDiscountType" AS ENUM ('percent', 'fixed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PromotionScope" AS ENUM ('store_wide', 'category', 'product');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tabela promotions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "promotions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "discount_type" "PromotionDiscountType" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "weekdays" INTEGER[] NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "scope" "PromotionScope" NOT NULL,
    "scope_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- ─── orders: colunas de desconto por promoção ───────────────────────────────

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promotion_discount_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promotion_snapshot" JSONB;

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "promotions_tenant_id_active_idx" ON "promotions"("tenant_id", "active");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks de negócio ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "promotions" ADD CONSTRAINT "promotions_discount_value_check" CHECK (
    "discount_value" > 0 AND ("discount_type" = 'fixed' OR "discount_value" <= 100)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- store_wide nunca tem alvo; category/product sempre têm — mesmo padrão do
-- XOR discount_percent/discount_value_cents em coupons.
DO $$ BEGIN
  ALTER TABLE "promotions" ADD CONSTRAINT "promotions_scope_id_xor_check" CHECK (
       ("scope" = 'store_wide' AND "scope_id" IS NULL)
    OR ("scope" IN ('category', 'product') AND "scope_id" IS NOT NULL)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "promotions" ADD CONSTRAINT "promotions_weekdays_check" CHECK (
    array_length("weekdays", 1) > 0
    AND "weekdays" <@ ARRAY[0,1,2,3,4,5,6]
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_promotion_discount_cents_check" CHECK ("promotion_discount_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS: tenant-scoped, mutável — mesma família de coupons ─────────────────

ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "promotions";
CREATE POLICY tenant_isolation ON "promotions"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "promotions" TO app_runtime;
