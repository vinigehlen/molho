-- Nota: falso drift removido à mão (mesmo achado documentado em CLAUDE.md)
-- — as FKs compostas/índices únicos parciais de addresses/delivery_zones/
-- modifier_groups/modifiers/products/store_hours só existem em SQL manual,
-- Prisma não os vê e tenta "corrigir". DROP DEFAULT de updated_at nas
-- tabelas existentes também removido (rede de segurança pra SQL cru, não é
-- drift real).

-- ─── Tipos ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'received', 'preparing', 'ready', 'in_transit', 'completed', 'expired', 'auto_canceled', 'canceled', 'delivery_failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('aguardando_confirmacao', 'confirmado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('not_applicable', 'pending', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tabelas ─────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE IF NOT EXISTS "orders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'received',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'aguardando_confirmacao',
    "refund_status" "RefundStatus" NOT NULL DEFAULT 'not_applicable',
    "subtotal_cents" INTEGER NOT NULL,
    "delivery_fee_cents" INTEGER NOT NULL,
    -- SEMPRE "quanto foi cobrado" na criação — NUNCA "quanto o cliente pagou
    -- líquido de estorno" (o estorno em si é manual no MVP, registrado em
    -- refund_status/audit_log/order_status_history, nunca recalculado
    -- aqui). Se o Épico 8 precisar de um "total líquido" de verdade, é
    -- campo NOVO, não mudança de semântica deste.
    "total_cents" INTEGER NOT NULL,
    "delivery_address_id" UUID,
    "delivery_label" TEXT NOT NULL,
    "delivery_street" TEXT NOT NULL,
    "delivery_number" TEXT,
    "delivery_complement" TEXT,
    "delivery_neighborhood" TEXT NOT NULL,
    "delivery_city" TEXT NOT NULL,
    "delivery_state" TEXT NOT NULL,
    "delivery_postal_code" TEXT,
    "delivery_reference_point" TEXT,
    "delivery_geo" geography(Point, 4326) NOT NULL,
    "canceled_at" TIMESTAMP(3),
    "canceled_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable — append-only (sem version/updated_at/deleted_at, mesmo
-- tratamento de audit_log): item de pedido não se edita, só existe.
CREATE TABLE IF NOT EXISTS "order_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit_base_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "line_total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable — append-only, mesmo tratamento.
CREATE TABLE IF NOT EXISTS "order_item_modifiers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "modifier_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_delta_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable — append-only, mesmo tratamento.
CREATE TABLE IF NOT EXISTS "order_status_history" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- Mesma rede de segurança de sempre — só `orders` tem updated_at.
ALTER TABLE "orders" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "orders_tenant_id_customer_id_idx" ON "orders"("tenant_id", "customer_id");
-- Query quente do gestor de pedidos (Épico 9): pedidos ativos da loja, por
-- status, já ordenados por criação.
CREATE INDEX IF NOT EXISTS "orders_tenant_id_store_id_status_created_at_idx" ON "orders"("tenant_id", "store_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "orders_tenant_id_created_at_idx" ON "orders"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "order_items_tenant_id_order_id_idx" ON "order_items"("tenant_id", "order_id");
CREATE INDEX IF NOT EXISTS "order_item_modifiers_tenant_id_order_item_id_idx" ON "order_item_modifiers"("tenant_id", "order_item_id");
-- A query de timeline de UM pedido (Épico 9, disputa) — é a razão desta tabela existir.
CREATE INDEX IF NOT EXISTS "order_status_history_tenant_id_order_id_created_at_idx" ON "order_status_history"("tenant_id", "order_id", "created_at");

-- ─── Alvos de FK composta ────────────────────────────────────────────────────
-- stores/customers/addresses/products já ganharam (id, tenant_id) em
-- épicos anteriores. modifiers nunca precisou até agora — nada tinha FK
-- composta pra lá.
CREATE UNIQUE INDEX IF NOT EXISTS "modifiers_id_tenant_id_key" ON "modifiers"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "orders_id_tenant_id_key" ON "orders"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "order_items_id_tenant_id_key" ON "order_items"("id", "tenant_id");

-- ─── Foreign keys simples (tenant_id → tenants) ──────────────────────────────

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Foreign keys simples, de propósito (não-composta) ──────────────────────
-- delivery_address_id: NÃO é FK composta com tenant_id. Uma FK composta com
-- ON DELETE SET NULL tentaria nulificar tenant_id TAMBÉM (que é NOT NULL em
-- orders) — erro real na primeira exclusão física de endereço, não só
-- teórico. O endereço já está inteiro SNAPSHOTADO nas colunas delivery_* —
-- esta FK é só rastreabilidade opcional pra UMA linha de addresses, não uma
-- fronteira de isolamento entre tenants (essa já vem do tenant_id do
-- próprio pedido + da FK composta de customer_id). Mesmo padrão de
-- audit_log/module_audit.actor_id → users(id) — FK simples pra uma
-- referência que não é a cadeia dono-dono do resto do schema.

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Foreign keys compostas (guardrail contra tenant_id inconsistente) ──────

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_tenant_id_fkey" FOREIGN KEY ("store_id", "tenant_id") REFERENCES "stores"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_tenant_id_fkey" FOREIGN KEY ("customer_id", "tenant_id") REFERENCES "customers"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_tenant_id_fkey" FOREIGN KEY ("order_id", "tenant_id") REFERENCES "orders"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_tenant_id_fkey" FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_tenant_id_fkey" FOREIGN KEY ("order_item_id", "tenant_id") REFERENCES "order_items"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifier_id_tenant_id_fkey" FOREIGN KEY ("modifier_id", "tenant_id") REFERENCES "modifiers"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_tenant_id_fkey" FOREIGN KEY ("order_id", "tenant_id") REFERENCES "orders"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks de negócio ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_subtotal_cents_check" CHECK ("subtotal_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_fee_cents_check" CHECK ("delivery_fee_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- total_cents = subtotal + taxa: verdade SEMPRE no MVP (estorno é manual,
-- fora do sistema, nunca reescreve esta linha — ver comentário na coluna).
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_total_cents_check" CHECK ("total_cents" = "subtotal_cents" + "delivery_fee_cents");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_base_price_cents_check" CHECK ("unit_base_price_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_cents_check" CHECK ("line_total_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_price_delta_cents_check" CHECK ("price_delta_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

-- orders é mutável (status/payment_status/version mudam) — uma policy só,
-- mesmo padrão de categories/products/delivery_zones.
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "orders";
CREATE POLICY tenant_isolation ON "orders"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

-- order_items/order_item_modifiers/order_status_history são append-only —
-- duas policies (SELECT, INSERT), SEM policy de UPDATE/DELETE (Postgres
-- nega os dois por padrão). Mesmo padrão exato de audit_log.

ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON "order_items";
CREATE POLICY tenant_isolation_select ON "order_items"
  FOR SELECT USING (app_tenant_visible("tenant_id"));
DROP POLICY IF EXISTS tenant_isolation_insert ON "order_items";
CREATE POLICY tenant_isolation_insert ON "order_items"
  FOR INSERT WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "order_item_modifiers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON "order_item_modifiers";
CREATE POLICY tenant_isolation_select ON "order_item_modifiers"
  FOR SELECT USING (app_tenant_visible("tenant_id"));
DROP POLICY IF EXISTS tenant_isolation_insert ON "order_item_modifiers";
CREATE POLICY tenant_isolation_insert ON "order_item_modifiers"
  FOR INSERT WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON "order_status_history";
CREATE POLICY tenant_isolation_select ON "order_status_history"
  FOR SELECT USING (app_tenant_visible("tenant_id"));
DROP POLICY IF EXISTS tenant_isolation_insert ON "order_status_history";
CREATE POLICY tenant_isolation_insert ON "order_status_history"
  FOR INSERT WITH CHECK (app_tenant_visible("tenant_id"));

-- Grant de tabela nova — ALTER DEFAULT PRIVILEGES da migration `init` já
-- cobre isto automaticamente. Explícito aqui só pra `orders` (mutável,
-- mesmo padrão de categories/products/delivery_zones) — as 3 append-only
-- seguem o mesmo tratamento de audit_log/module_audit: sem GRANT
-- explícito, a RLS (sem policy de UPDATE/DELETE) já é quem restringe.
GRANT SELECT, INSERT, UPDATE, DELETE ON "orders" TO app_runtime;
