-- Épico balcão (walk-in create) — parte 2. Os dois valores novos de
-- PaymentMethod já foram commitados na migration anterior.
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).

-- ─── customers.phone_* viram opcionais ────────────────────────────────────
--
-- Pedido de balcão cria um Customer ANÔNIMO (sem telefone algum) — não é
-- "guest do checkout" (Épico 9c: sempre tem telefone auto-declarado), é
-- venda no caixa sem coleta de contato. `phone_lookup_hash` NULL não colide
-- no índice único parcial existente (`customers_active_phone_hash` —
-- Postgres nunca considera dois NULL iguais), então N clientes de balcão
-- convivem sem conflito, sem precisar tocar no índice.
ALTER TABLE "customers" ALTER COLUMN "phone_ciphertext" DROP NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "phone_lookup_hash" DROP NOT NULL;

-- ─── orders.idempotency_key ────────────────────────────────────────────────
--
-- Nullable + UNIQUE comum (não parcial): NULL nunca colide consigo mesmo num
-- índice único do Postgres, então isto já se comporta como "único só entre
-- valores não-nulos" sem precisar de WHERE — diferente do caso de
-- soft-delete (lá o NULO seria a linha "viva de novo", aqui o nulo É o
-- estado normal do checkout comum, que não usa este header).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_idempotency_key_key" UNIQUE ("tenant_id", "idempotency_key");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── CHECK payment_method × fulfillment_type × change_for_cents ──────────
--
-- Não existia CHECK de banco pra isso antes desta migration (só validação
-- no zod de @molho/contracts/checkout.ts, união discriminada `.strict()`
-- por branch de paymentMethod) — nasce aqui já cobrindo as DUAS regras
-- juntas, sem afrouxar a que já valia:
--   1. change_for_cents só é setado com cash_on_delivery (igual já era,
--      agora também garantido pelo banco, não só pela aplicação).
--   2. cash_at_counter/card_at_counter só valem em pedido pickup — nunca
--      delivery (o balcão não entrega).
-- A invariante de delivery (`orders_delivery_requires_address_check`, da
-- migration 20260812100000) não é tocada — CHECK diferente, sem overlap.
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_invariants_check" CHECK (
    ("change_for_cents" IS NULL OR "payment_method" = 'cash_on_delivery')
    AND ("payment_method" NOT IN ('cash_at_counter', 'card_at_counter') OR "fulfillment_type" = 'pickup')
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
