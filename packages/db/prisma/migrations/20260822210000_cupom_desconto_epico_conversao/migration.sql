-- Épico conversão (C2) — cupom de desconto v1 ENXUTO.
-- docs/handoff-features-conversao-gestor.md A2.
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).
--
-- ATENÇÃO — se esta migration for regenerada via `prisma migrate dev
-- --create-only`, arrancar à mão o bloco de falso drift (DROP das FKs
-- compostas/índices únicos parciais que schema.prisma não expressa),
-- mesmo achado documentado no CLAUDE.md.
--
-- NÃO aplicado no banco por esta sessão: Neon dev com drift de outra sessão
-- (20260820181726_tenant_status_trial sem correspondente no git) — escrita
-- aqui pronta pra `prisma migrate deploy` assim que o dev DB estiver limpo.

-- ─── Tipos ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "CouponDiscountType" AS ENUM ('percent', 'fixed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tabela coupons ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "coupons" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "discount_type" "CouponDiscountType" NOT NULL,
    "discount_percent" INTEGER,
    "discount_value_cents" INTEGER,
    "min_order_cents" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "max_uses" INTEGER NOT NULL,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- ─── orders: colunas de desconto ─────────────────────────────────────────────

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_code_snapshot" TEXT;

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "coupons_tenant_id_code_idx" ON "coupons"("tenant_id", "code");

-- Alvo de FK composta.
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_id_tenant_id_key" ON "coupons"("id", "tenant_id");

-- Código único por tenant, case-insensitive, só entre cupons vivos — parcial
-- em deleted_at (CLAUDE.md: toda UNIQUE que interage com soft delete vira
-- índice único parcial, senão o cupom apagado trava o código pra sempre).
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_tenant_id_upper_code_key" ON "coupons"("tenant_id", upper("code")) WHERE "deleted_at" IS NULL;

-- Pedidos de UM cupom (relatório "quantos pedidos usaram X") — tenant_id
-- primeiro, mesmo quando coupon_id é NULL na maioria das linhas.
CREATE INDEX IF NOT EXISTS "orders_tenant_id_coupon_id_idx" ON "orders"("tenant_id", "coupon_id");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- FK só rastreabilidade (RESTRICT, não CASCADE) — cupom não pode ser
-- apagado de verdade (soft delete) enquanto pedido referenciar; mesmo
-- racional de delivery_address_id.
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_tenant_id_fkey" FOREIGN KEY ("coupon_id", "tenant_id") REFERENCES "coupons"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks de negócio ───────────────────────────────────────────────────────

-- XOR por tipo — mesmo padrão de delivery_zones_city_xor_polygon.
DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_value_xor_check" CHECK (
       ("discount_type" = 'percent' AND "discount_percent" IS NOT NULL AND "discount_value_cents" IS NULL)
    OR ("discount_type" = 'fixed'   AND "discount_value_cents" IS NOT NULL AND "discount_percent" IS NULL)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_percent_range_check" CHECK (
    "discount_percent" IS NULL OR ("discount_percent" >= 1 AND "discount_percent" <= 100)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_value_cents_check" CHECK (
    "discount_value_cents" IS NULL OR "discount_value_cents" > 0
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_min_order_cents_check" CHECK ("min_order_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_starts_before_ends_check" CHECK ("starts_at" < "ends_at");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_max_uses_check" CHECK ("max_uses" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Defesa em profundidade do incremento atômico (uses_count nunca passa de
-- max_uses, mesmo se um caminho de aplicação esquecer o WHERE condicional).
DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_uses_count_range_check" CHECK ("uses_count" >= 0 AND "uses_count" <= "max_uses");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_cents_check" CHECK (
    "discount_cents" >= 0 AND "discount_cents" <= "subtotal_cents" + "delivery_fee_cents"
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- v1 não tem desconto manual — todo discount_cents > 0 tem que vir de um
-- cupom identificável (e vice-versa: sem desconto, sem cupom "solto").
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_coupon_consistency_check" CHECK (
    ("discount_cents" = 0 AND "coupon_id" IS NULL AND "coupon_code_snapshot" IS NULL)
    OR ("discount_cents" > 0 AND "coupon_id" IS NOT NULL AND "coupon_code_snapshot" IS NOT NULL)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- total_cents passa a contabilizar o desconto — discount_cents é sempre 0
-- até o checkout aplicar um cupom (C2 ainda não fecha essa ponta), então
-- esta migration não muda o valor de nenhum total_cents já gravado.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_total_cents_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_cents_check" CHECK (
  "total_cents" = "subtotal_cents" + "delivery_fee_cents" - "discount_cents"
);

-- ─── RLS: tenant-scoped, mutável — mesma família de products/modifiers ──────

ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "coupons";
CREATE POLICY tenant_isolation ON "coupons"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "coupons" TO app_runtime;
