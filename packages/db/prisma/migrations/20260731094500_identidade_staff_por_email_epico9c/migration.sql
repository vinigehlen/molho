-- Passo 3 do OTP por e-mail (Épico 9c): identidade de STAFF passa a ser
-- chaveada por e-mail; identidade de CLIENTE continua chaveada por telefone.
-- Ver docs/08-plano-9c.md § "OTP por e-mail — passo 3: IDENTIDADE".
--
-- Todo SQL aqui é idempotente: `prisma migrate dev` replaya o shadow database
-- várias vezes por invocação (CLAUDE.md).

-- ── users: identidade por e-mail ────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_ciphertext" BYTEA;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_lookup_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_key_version" INTEGER NOT NULL DEFAULT 1;

-- Staff que nasce pelo canal de e-mail não tem telefone. O único parcial de
-- telefone (users_active_phone_hash) fica INTACTO — SMS de staff continua
-- funcional pra rollback de canal.
ALTER TABLE "users" ALTER COLUMN "phone_ciphertext" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "phone_lookup_hash" DROP NOT NULL;

-- Coluna MORTA desde o init (zero leitura/escrita em apps/api/src,
-- packages/db/src e no seed). Mantê-la em claro ao lado do hash anularia o
-- pepper: quem tivesse o dump leria a lista de e-mails direto.
ALTER TABLE "users" DROP COLUMN IF EXISTS "email";

-- Único só entre linhas vivas (padrão da casa: soft delete nunca trava um
-- valor pra sempre). O índice único do Postgres trata cada NULL como
-- distinto, então os staff atuais — todos sem e-mail — convivem aqui sem
-- backfill prévio e sem violar nada. O `IS NOT NULL` só enxuga o índice.
CREATE UNIQUE INDEX IF NOT EXISTS "users_active_email_hash"
  ON "users" ("email_lookup_hash")
  WHERE "deleted_at" IS NULL AND "email_lookup_hash" IS NOT NULL;

-- ── customers: e-mail é SÓ canal de entrega, NUNCA identidade ───────────────
-- INVARIANTE: nenhum email_lookup_hash, nenhum unique, nenhum índice por
-- e-mail nesta tabela. A identidade do cliente continua sendo
-- (tenant_id, phone_lookup_hash). Sem índice, nenhuma query futura consegue
-- chavear cliente por e-mail nem por acidente — e o fim do piloto (volta do
-- SMS) é troca de env, não re-migração de identidade.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email_ciphertext" BYTEA;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email_key_version" INTEGER NOT NULL DEFAULT 1;

-- RLS: nada a fazer. `users` não tem RLS por desenho (identidade global,
-- CLAUDE.md regra 3); as policies de `customers` são por LINHA
-- (app_tenant_visible(tenant_id)) e cobrem colunas novas automaticamente.
