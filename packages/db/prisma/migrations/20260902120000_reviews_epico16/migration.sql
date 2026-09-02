-- Épico 16 (avaliações, D1-D4 travadas com o PM em 2026-09-02):
-- - review é imutável do lado do cliente (só cria, nunca edita/apaga);
-- - lojista responde publicamente, uma resposta por review;
-- - módulo `reviews` nasce sempre ligado (mesma política de coupons/combos);
-- - storefront mostra só nota média + contagem por ora (sem lista individual).
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).

CREATE TABLE IF NOT EXISTS "reviews" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "reviews_tenant_id_order_id_idx" ON "reviews"("tenant_id", "order_id");

-- Um review vivo por pedido — parcial em deleted_at (CLAUDE.md: soft delete
-- nunca trava um valor pra sempre; aqui não há delete de verdade hoje, mas
-- a convenção vale igual pro dia que precisar).
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_tenant_id_order_id_key" ON "reviews"("tenant_id", "order_id") WHERE "deleted_at" IS NULL;

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_tenant_id_fkey" FOREIGN KEY ("order_id", "tenant_id") REFERENCES "orders"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_tenant_id_fkey" FOREIGN KEY ("customer_id", "tenant_id") REFERENCES "customers"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks de negócio ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range_check" CHECK ("rating" >= 1 AND "rating" <= 5);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- repliedAt existe SSE reply existe — mesmo racional do XOR de cupom.
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reply_repliedat_consistency_check" CHECK (
    ("reply" IS NULL AND "replied_at" IS NULL) OR ("reply" IS NOT NULL AND "replied_at" IS NOT NULL)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS: tenant-scoped, mutável (só a resposta do lojista muta) ────────────

ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "reviews";
CREATE POLICY tenant_isolation ON "reviews"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "reviews" TO app_runtime;
