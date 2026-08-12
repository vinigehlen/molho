-- Retirada no balcão — docs/03 §4 e docs/04 §"Checkout" já previam os dois
-- tipos (`entrega`/`retirada`), MVP nasceu delivery-only. `pickup` usa o
-- endereço da PRÓPRIA loja (`stores.address_text`, já existe) — nenhuma
-- coluna nova de loja, só a ausência do endereço do cliente no pedido.
--
-- Idempotente (o `prisma migrate dev` replaya o shadow database várias vezes
-- por invocação — CLAUDE.md § convenções de schema).

-- ─── FulfillmentType ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "FulfillmentType" AS ENUM ('delivery', 'pickup');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── orders.fulfillment_type ──────────────────────────────────────────────
--
-- DEFAULT 'delivery' só pra preencher as linhas existentes (todo pedido até
-- aqui nasceu do checkout delivery-only) — e DROPADO na sequência, mesmo
-- racional de customer_verified (Épico 9c): sem default, nenhum writer
-- futuro carimba "entrega" por omissão. Quem insere é SQL cru
-- (`PrismaCheckoutOrderRepository.createOrder`), que lista a coluna.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fulfillment_type" "FulfillmentType" NOT NULL DEFAULT 'delivery';
ALTER TABLE "orders" ALTER COLUMN "fulfillment_type" DROP DEFAULT;

-- ─── orders.delivery_* viram opcionais ────────────────────────────────────
--
-- Só existem quando fulfillment_type = 'delivery'. `delivery_postal_code`,
-- `delivery_reference_point` e `delivery_geo` já eram nullable (Épico 6,
-- Bloco 2) — só os 5 campos abaixo eram NOT NULL até aqui.
ALTER TABLE "orders" ALTER COLUMN "delivery_label" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "delivery_street" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "delivery_neighborhood" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "delivery_city" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "delivery_state" DROP NOT NULL;

-- Barra a combinação inválida: pedido `delivery` sem endereço. Pedido
-- `pickup` pode ter os 5 campos NULL ou não (nunca escritos por esse
-- branch) — o CHECK só restringe o lado `delivery`.
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_requires_address_check" CHECK (
    "fulfillment_type" = 'pickup' OR (
      "delivery_label" IS NOT NULL AND
      "delivery_street" IS NOT NULL AND
      "delivery_neighborhood" IS NOT NULL AND
      "delivery_city" IS NOT NULL AND
      "delivery_state" IS NOT NULL
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
