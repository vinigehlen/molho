-- Épico conversão (C3) — agendamento de pedido.
-- docs/handoff-features-conversao-gestor.md A3.
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).
--
-- ATENÇÃO — se esta migration for regenerada via `prisma migrate dev
-- --create-only`, arrancar à mão o bloco de falso drift (DROP das FKs
-- compostas/índices únicos parciais que schema.prisma não expressa).
--
-- NÃO aplicado no banco por esta sessão — mesmo bloqueio de drift do Neon
-- dev dos commits C1/C2 (20260820181726_tenant_status_trial sem
-- correspondente no git, de outra sessão).

-- ─── Tabela store_scheduling_slots ──────────────────────────────────────────
--
-- Camada EM CIMA de store_hours, não substituta — "quando a loja abre" e
-- "quais janelas aceitam pedido AGENDADO, com que teto" são perguntas
-- diferentes. Recorrente por dia da semana (mesmo padrão de store_hours);
-- max_orders é por OCORRÊNCIA do slot (uma sexta específica), não somado
-- entre semanas — quem conta é o serviço de checkout (fora do escopo).

CREATE TABLE IF NOT EXISTS "store_scheduling_slots" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "starts_at_minutes" INTEGER NOT NULL,
    "ends_at_minutes" INTEGER NOT NULL,
    "max_orders" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "store_scheduling_slots_pkey" PRIMARY KEY ("id")
);

-- ─── orders: agendamento ─────────────────────────────────────────────────────

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "scheduled_for" TIMESTAMP(3);

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- tenant_id primeiro (CLAUDE.md) — cobre "slots de UMA loja, em ordem de dia".
CREATE INDEX IF NOT EXISTS "store_scheduling_slots_tenant_id_store_id_day_of_week_idx" ON "store_scheduling_slots"("tenant_id", "store_id", "day_of_week");

-- Alvo de FK composta.
CREATE UNIQUE INDEX IF NOT EXISTS "store_scheduling_slots_id_tenant_id_key" ON "store_scheduling_slots"("id", "tenant_id");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "store_scheduling_slots" ADD CONSTRAINT "store_scheduling_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "store_scheduling_slots" ADD CONSTRAINT "store_scheduling_slots_store_id_tenant_id_fkey" FOREIGN KEY ("store_id", "tenant_id") REFERENCES "stores"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks de negócio ───────────────────────────────────────────────────────

-- v1 não modela slot atravessando meia-noite (diferente de StoreHours) —
-- exige starts < ends, simples de propósito (docs/handoff §1: "se a fatia
-- te levar a sair do escopo descrito, PARA e avisa").
DO $$ BEGIN
  ALTER TABLE "store_scheduling_slots" ADD CONSTRAINT "store_scheduling_slots_minutes_range_check" CHECK (
    "starts_at_minutes" >= 0 AND "starts_at_minutes" <= 1439
    AND "ends_at_minutes" >= 0 AND "ends_at_minutes" <= 1439
    AND "starts_at_minutes" < "ends_at_minutes"
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "store_scheduling_slots" ADD CONSTRAINT "store_scheduling_slots_max_orders_check" CHECK ("max_orders" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS: tenant-scoped, mutável — mesma família de store_hours ─────────────

ALTER TABLE "store_scheduling_slots" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "store_scheduling_slots";
CREATE POLICY tenant_isolation ON "store_scheduling_slots"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "store_scheduling_slots" TO app_runtime;
