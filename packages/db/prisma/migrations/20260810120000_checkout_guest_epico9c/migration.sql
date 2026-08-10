-- Checkout sem OTP (Épico 9c) — procedência da identidade do cliente.
--
-- Ver CLAUDE.md regra 13 (EMENDA) e docs/08 § "Interruptor de CHECKOUT SEM OTP".
-- Nenhuma policy de RLS muda: `customers` e `orders` já são por linha via
-- `app_tenant_visible(tenant_id)`, e policy cobre coluna nova automaticamente.
--
-- Idempotente (o `prisma migrate dev` replaya o shadow database várias vezes
-- por invocação — CLAUDE.md § convenções de schema).

-- ─── customers.phone_verified_at ─────────────────────────────────────────────
--
-- `null` = telefone auto-declarado (checkout guest). Só o verify do OTP carimba.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phone_verified_at" TIMESTAMP(3);

-- Backfill de UMA VEZ: toda linha que existe neste instante nasceu do verify do
-- OTP (era o único caminho que criava customer antes desta migration), então
-- `created_at` É o instante da verificação. O `WHERE ... IS NULL` torna o
-- replay inofensivo, e não há guest nenhum pra marcar errado: o caminho que os
-- cria só passa a existir com o código que acompanha esta migration.
UPDATE "customers" SET "phone_verified_at" = "created_at" WHERE "phone_verified_at" IS NULL;

-- ─── orders.customer_verified ────────────────────────────────────────────────
--
-- DEFAULT true só pra preencher as linhas existentes (todas pré-guest, todas
-- verificadas por OTP) — e DROPADO na sequência de propósito: sem default,
-- nenhum writer futuro consegue carimbar "verificado" por omissão. Quem insere
-- é SQL cru (`PrismaCheckoutOrderRepository.createOrder`), que lista a coluna.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_verified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "orders" ALTER COLUMN "customer_verified" DROP DEFAULT;
