-- Épico 16b (fidelidade por cashback). Decisões travadas com o PM em
-- 2026-09-02:
-- D1: cashback (% do pedido vira saldo), não pontos.
-- D2: crédito só em pedido `completed` (regra já travada em docs/01).
-- D3: resgate "tudo ou nada" — toggle "usar meu saldo", sem valor parcial.
-- D4: sem expiração no MVP.
-- D5: taxa configurável POR TENANT (não fixa da plataforma).
-- D6: cashback empilha com cupom — coluna independente, sem XOR.
-- D7: módulo `loyalty` sempre ligado (mesma política de coupons/combos/reviews).
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).

DO $$ BEGIN
  CREATE TYPE "LoyaltyEventType" AS ENUM ('earn', 'redeem');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── orders: coluna de cashback usado ────────────────────────────────────────

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cashback_used_cents" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_cashback_used_cents_check" CHECK ("cashback_used_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- total_cents agora também desconta o cashback usado (D6: empilha com
-- desconto de cupom, coluna independente). Reescreve o CHECK anterior
-- (Épico conversão C2) — mesmo padrão de "sempre reescrever, nunca só somar".
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_total_cents_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_cents_check" CHECK (
  "total_cents" = "subtotal_cents" + "delivery_fee_cents" - "discount_cents" - "cashback_used_cents"
);

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_total_cents_nonnegative_check" CHECK ("total_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── loyalty_config ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "loyalty_config" (
    "tenant_id" UUID NOT NULL,
    "cashback_percent" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "loyalty_config_pkey" PRIMARY KEY ("tenant_id")
);

DO $$ BEGIN
  ALTER TABLE "loyalty_config" ADD CONSTRAINT "loyalty_config_cashback_percent_range_check" CHECK ("cashback_percent" >= 1 AND "cashback_percent" <= 100);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loyalty_config" ADD CONSTRAINT "loyalty_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "loyalty_config" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "loyalty_config";
CREATE POLICY tenant_isolation ON "loyalty_config"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "loyalty_config" TO app_runtime;

-- ─── loyalty_balances ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "loyalty_balances" (
    "customer_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "balance_cents" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "loyalty_balances_pkey" PRIMARY KEY ("customer_id")
);

CREATE INDEX IF NOT EXISTS "loyalty_balances_tenant_id_idx" ON "loyalty_balances"("tenant_id");

DO $$ BEGIN
  ALTER TABLE "loyalty_balances" ADD CONSTRAINT "loyalty_balances_balance_cents_check" CHECK ("balance_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loyalty_balances" ADD CONSTRAINT "loyalty_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loyalty_balances" ADD CONSTRAINT "loyalty_balances_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "loyalty_balances" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "loyalty_balances";
CREATE POLICY tenant_isolation ON "loyalty_balances"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "loyalty_balances" TO app_runtime;

-- ─── loyalty_events (ledger append-only) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS "loyalty_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "LoyaltyEventType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "loyalty_events_tenant_id_customer_id_created_at_idx" ON "loyalty_events"("tenant_id", "customer_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_amount_cents_check" CHECK ("amount_cents" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "loyalty_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "loyalty_events";
CREATE POLICY tenant_isolation ON "loyalty_events"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT ON "loyalty_events" TO app_runtime;
