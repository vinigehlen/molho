-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('pix', 'cash_on_delivery', 'card_on_delivery');

-- Falso drift removido (composite FKs/índices id_tenant_id à mão em migrations
-- anteriores, e ALTER COLUMN updated_at DROP DEFAULT — ver CLAUDE.md).

-- AlterTable
ALTER TABLE "orders"
  ADD COLUMN "change_for_cents" INTEGER,
  ADD COLUMN "payment_method" "PaymentMethod";

-- Backfill: única linha existente é o pedido de teste do Épico 7, criado
-- quando o checkout só sabia fazer PIX (ver nota "Seed do Épico 9" em
-- docs/01-plano-produto.md §8).
UPDATE "orders" SET "payment_method" = 'pix' WHERE "payment_method" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "payment_method" SET NOT NULL;
