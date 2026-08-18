-- Épico balcão (edição de pedido) — CC-only, docs/balcao/contrato-mutacao-pedido.md
-- resolvido pro escopo mínimo: 3 operações (add_item unitário, remove_item
-- integral, change_qty), sem revisão em lote, sem cliente técnico (isso já
-- existe desde o walk-in create).
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).
--
-- ATENÇÃO — `prisma migrate dev --create-only` gerou, junto com o que
-- interessa aqui, o bloco de falso drift já documentado no CLAUDE.md
-- (mesma classe do `updated_at DROP DEFAULT`): DROP das FKs compostas
-- `(id, tenant_id)` e dos índices únicos parciais que `schema.prisma`
-- não expressa. ARRANCADO À MÃO — nunca aplicar esse bloco.

-- ─── Tipos ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "OrderAdjustmentKind" AS ENUM ('add_item', 'remove_item', 'change_qty');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── orders.current_subtotal_cents / current_total_cents ─────────────────────
--
-- NULL = pedido nunca ajustado, o total original (subtotal_cents/total_cents,
-- congelados na criação) continua valendo — quem lê faz fallback
-- (current_total_cents ?? total_cents). Uma vez setado pelo primeiro ajuste,
-- é sempre recalculado do zero (subtotal original + Σ deltas de
-- order_adjustments), nunca incrementado em cima do valor atual anterior.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "current_subtotal_cents" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "current_total_cents" INTEGER;

-- Os dois nascem e existem juntos (nunca só um setado) e, quando setados,
-- current_total = current_subtotal + delivery_fee — mesma fórmula do CHECK
-- de total_cents original (migration do Épico 7), só que sobre os campos
-- ATUAIS.
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_current_totals_consistency_check" CHECK (
    (("current_subtotal_cents" IS NULL) = ("current_total_cents" IS NULL))
    AND ("current_total_cents" IS NULL OR "current_total_cents" = "current_subtotal_cents" + "delivery_fee_cents")
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tabela order_adjustments ──────────────────────────────────────────────
--
-- Append-only, mesmo tratamento de order_status_history/audit_log: uma
-- linha por chamada do endpoint de ajuste (união discriminada por `kind`,
-- nunca lote). `order_item_id` é sempre NOT NULL — pra add_item é o item
-- recém-criado (a linha em order_items nasce primeiro, o ajuste referencia
-- ela); pra remove_item/change_qty é o item já existente. `actor_id` é
-- sempre staff (endpoint staff-only), nunca nulo — diferente de
-- order_status_history, que também aceita ator cliente/sistema.

CREATE TABLE IF NOT EXISTS "order_adjustments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "kind" "OrderAdjustmentKind" NOT NULL,
    -- Deltas SIGNED desta operação (não valor absoluto): add_item positivo,
    -- remove_item negativo (remoção é sempre integral, delta = -quantidade
    -- original do item), change_qty positivo ou negativo. A soma destes
    -- deltas + subtotal original é que vira current_subtotal_cents.
    "quantity_delta" INTEGER NOT NULL,
    "subtotal_delta_cents" INTEGER NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_role" TEXT NOT NULL,
    -- Escrita idempotente (mesma infra do walk-in) — retry de rede com a
    -- MESMA chave não duplica o ajuste.
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_adjustments_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- Timeline de ajustes de UM pedido — a razão desta tabela existir (mesmo
-- racional de order_status_history_tenant_id_order_id_created_at_idx).
CREATE INDEX IF NOT EXISTS "order_adjustments_tenant_id_order_id_idx" ON "order_adjustments"("tenant_id", "order_id");

-- Idempotência ESCOPADA AO PEDIDO (não ao tenant inteiro, diferente de
-- orders.idempotencyKey): a mesma chave em pedidos DIFERENTES não colide —
-- cada ajuste é uma ação sobre UM pedido específico.
CREATE UNIQUE INDEX IF NOT EXISTS "order_adjustments_tenant_id_order_id_idempotency_key_key" ON "order_adjustments"("tenant_id", "order_id", "idempotency_key");

-- Drift real, pré-existente e sem relação com este épico: PrintJob já
-- declarava `@@index([tenantId, orderId])` no schema.prisma desde o
-- Épico 10, mas a migration original só criou o índice parcial FIFO
-- (print_jobs_tenant_id_created_at_queued_idx) e a FK composta — nunca
-- este índice simples. Aproveitando a mesma passada de `--create-only`
-- (é aditivo, sem risco, não é o bloco de falso drift).
CREATE INDEX IF NOT EXISTS "print_jobs_tenant_id_order_id_idx" ON "print_jobs"("tenant_id", "order_id");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Composta (guardrail contra tenant_id inconsistente, mesmo padrão de
-- order_items/print_jobs → orders): ajuste não pode apontar pra pedido de
-- OUTRO tenant mesmo com bug de aplicação. orders(id, tenant_id) já existe
-- como alvo (migration do Épico 7).
DO $$ BEGIN
  ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_id_tenant_id_fkey" FOREIGN KEY ("order_id", "tenant_id") REFERENCES "orders"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Mesmo guardrail pro item-alvo: não pode apontar pra order_item de OUTRO
-- tenant. order_items(id, tenant_id) já existe como alvo (migration do
-- Épico 7).
DO $$ BEGIN
  ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_item_id_tenant_id_fkey" FOREIGN KEY ("order_item_id", "tenant_id") REFERENCES "order_items"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- actor_id → users(id) é FK SIMPLES (users não tem tenant_id, mesma exceção
-- documentada em CLAUDE.md pra user_roles/order_status_history.actor_id).
DO $$ BEGIN
  ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

-- Append-only — duas policies (SELECT, INSERT), SEM policy de UPDATE/DELETE
-- (Postgres nega os dois por padrão). Mesmo padrão exato de
-- order_status_history/audit_log. Sem GRANT explícito: ALTER DEFAULT
-- PRIVILEGES da migration `init` já cobre tabela nova, e a ausência de
-- policy de UPDATE/DELETE é quem restringe de verdade.
ALTER TABLE "order_adjustments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON "order_adjustments";
CREATE POLICY tenant_isolation_select ON "order_adjustments"
  FOR SELECT USING (app_tenant_visible("tenant_id"));
DROP POLICY IF EXISTS tenant_isolation_insert ON "order_adjustments";
CREATE POLICY tenant_isolation_insert ON "order_adjustments"
  FOR INSERT WITH CHECK (app_tenant_visible("tenant_id"));
