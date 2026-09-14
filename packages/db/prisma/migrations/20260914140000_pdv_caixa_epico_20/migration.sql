-- Épico 20 (PDV + caixa) — docs/HANDOFF-epico-20-pdv-caixa.md
--
-- Sessão de caixa por LOJA (não por operador — decisão 3 do handoff): quem
-- abre/fecha/sangra fica registrado por AÇÃO (opened_by_user_id/
-- closed_by_user_id/cash_withdrawals.requested_by_user_id), a sessão em si é
-- "a sessão aberta da loja". Índice único parcial garante só uma sessão
-- aberta por loja ao mesmo tempo.
--
-- cash_withdrawals (sangria) exige aprovação de manager por PIN — decisão 5
-- do handoff, não fica pra depois. approved_by_user_id nunca nulo.
--
-- Idempotente (o `prisma migrate dev` replaya o shadow database várias vezes
-- por invocação — CLAUDE.md § convenções de schema). Gerada com
-- `prisma migrate diff --script` e reescrita à mão: o diff bruto trazia DROP
-- de cmv_* (módulo sem model no schema.prisma, drift pré-existente e sem
-- relação com este épico — NUNCA aplicar) e o bloco de falso drift de
-- FKs/índices compostos `(id, tenant_id)` que schema.prisma não expressa
-- (mesma classe documentada nas migrations do Épico balcão/6).

-- ─── Tipos ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "CashSessionStatus" AS ENUM ('open', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tabela cash_sessions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cash_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_by_user_id" UUID NOT NULL,
    "opening_amount_cents" INTEGER NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" UUID,
    -- Valor contado fisicamente pelo operador no fechamento.
    "counted_amount_cents" INTEGER,
    -- opening + vendas_dinheiro - sangrias no instante do fechamento —
    -- snapshot calculado então, nunca recalculado depois (mesmo racional de
    -- orders.total_cents). Diferença pra counted_amount_cents = quebra de caixa.
    "expected_amount_cents" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- ─── Tabela cash_withdrawals (sangria, append-only) ─────────────────────────

CREATE TABLE IF NOT EXISTS "cash_withdrawals" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT,
    "requested_by_user_id" UUID NOT NULL,
    "approved_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_withdrawals_pkey" PRIMARY KEY ("id")
);

-- ─── orders.cash_session_id ──────────────────────────────────────────────────
--
-- Nullable: só pedido de balcão pago em dinheiro/cartão na hora
-- (cash_at_counter/card_at_counter) vincula — pedido de storefront (PIX/
-- delivery) nunca tem sessão. CHECK abaixo só veta a direção errada (nunca
-- exige presença): pedido de balcão HISTÓRICO, criado antes deste épico,
-- continua com cash_session_id NULL e válido — sessão obrigatória pra
-- vender é regra de APLICAÇÃO (CounterOrderService), não constraint de
-- banco, porque não há sessão real pra "backfillar" nesses pedidos antigos.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cash_session_id" UUID;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_cash_session_payment_method_check" CHECK (
    "cash_session_id" IS NULL OR "payment_method" IN ('cash_at_counter', 'card_at_counter')
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- Alvo de FK composta (orders.cash_session_id, cash_withdrawals.cash_session_id)
-- → cash_sessions(id, tenant_id) — mesmo padrão de orders_id_tenant_id_key.
CREATE UNIQUE INDEX IF NOT EXISTS "cash_sessions_id_tenant_id_key" ON "cash_sessions"("id", "tenant_id");

-- Só uma sessão ABERTA por loja ao mesmo tempo (decisão 3 do handoff) —
-- índice único parcial, Prisma não expressa isso no DSL.
CREATE UNIQUE INDEX IF NOT EXISTS "cash_sessions_tenant_id_store_id_open_key"
  ON "cash_sessions"("tenant_id", "store_id") WHERE "status" = 'open';

-- Histórico de sessões da loja (tela de fechamento/relatório).
CREATE INDEX IF NOT EXISTS "cash_sessions_tenant_id_store_id_status_idx"
  ON "cash_sessions"("tenant_id", "store_id", "status");

-- Extrato de sangria de UMA sessão.
CREATE INDEX IF NOT EXISTS "cash_withdrawals_tenant_id_cash_session_id_idx"
  ON "cash_withdrawals"("tenant_id", "cash_session_id");

-- ─── Foreign keys — cash_sessions ────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Composta (guardrail contra tenant_id inconsistente, mesmo padrão de
-- delivery_zones/store_hours → stores, Épico 6): sessão não pode apontar
-- pra loja de OUTRO tenant mesmo com bug de aplicação.
DO $$ BEGIN
  ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_store_id_tenant_id_fkey" FOREIGN KEY ("store_id", "tenant_id") REFERENCES "stores"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- users(id) é FK SIMPLES (users não tem tenant_id, mesma exceção documentada
-- em CLAUDE.md pra user_roles/order_status_history.actor_id/print_devices).
DO $$ BEGIN
  ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Foreign keys — cash_withdrawals ─────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_cash_session_id_tenant_id_fkey" FOREIGN KEY ("cash_session_id", "tenant_id") REFERENCES "cash_sessions"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- approved_by nunca pode ser o mesmo que requested_by (auto-aprovação
-- furaria o controle) — CHECK, não só regra de aplicação.
DO $$ BEGIN
  ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_approver_not_requester_check" CHECK ("approved_by_user_id" != "requested_by_user_id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Foreign key composta — orders.cash_session_id ──────────────────────────

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_cash_session_id_tenant_id_fkey" FOREIGN KEY ("cash_session_id", "tenant_id") REFERENCES "cash_sessions"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

-- cash_sessions é mutável (abre → fecha), acesso sempre em contexto de
-- staff com tenant já resolvido (JwtAuthGuard) — mesmo padrão de
-- cmv_ingredients, sem FORCE (a exceção FORCE é só pro caso "job
-- administrativo" de print_jobs/print_devices, que lê antes de saber o
-- tenant).
ALTER TABLE "cash_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cash_sessions";
CREATE POLICY tenant_isolation ON "cash_sessions"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

-- cash_withdrawals é append-only (sangria nunca é editada/desfeita) — duas
-- policies (SELECT, INSERT), SEM policy de UPDATE/DELETE, mesmo padrão de
-- order_adjustments/notification_log. Postgres nega os dois por padrão.
ALTER TABLE "cash_withdrawals" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON "cash_withdrawals";
CREATE POLICY tenant_isolation_select ON "cash_withdrawals"
  FOR SELECT USING (app_tenant_visible("tenant_id"));
DROP POLICY IF EXISTS tenant_isolation_insert ON "cash_withdrawals";
CREATE POLICY tenant_isolation_insert ON "cash_withdrawals"
  FOR INSERT WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "cash_sessions" TO app_runtime;
GRANT SELECT, INSERT ON "cash_withdrawals" TO app_runtime;
