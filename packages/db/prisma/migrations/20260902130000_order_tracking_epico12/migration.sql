-- Épico 12: página pública de acompanhamento por token opaco.
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).
-- `gen_random_uuid()` vem do pgcrypto já usado no projeto e entrega 122 bits
-- aleatórios, suficiente para link público não-adivinhável sem dependência nova.

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "tracking_token" UUID NOT NULL DEFAULT gen_random_uuid();

-- Token único só entre pedidos vivos. Pedido soft-deletado não deve travar
-- um token para sempre (mesma convenção de qualquer UNIQUE com deleted_at).
CREATE UNIQUE INDEX IF NOT EXISTS "orders_tracking_token_key"
  ON "orders"("tracking_token")
  WHERE "deleted_at" IS NULL;
