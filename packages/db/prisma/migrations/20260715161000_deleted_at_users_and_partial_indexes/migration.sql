-- Escrita à mão (não via `prisma migrate dev --create-only`): o shadow
-- database que o Prisma cria pra detectar drift não tem PostGIS instalado
-- (a extensão só existe no banco real, via bootstrap.sql), então replayar a
-- migration `init` (que usa geography(Point,4326)) nele falha com
-- "type geography does not exist". Editei este arquivo direto, mesma lógica
-- de sempre: Prisma só aplica o SQL, não precisa ter sido ele quem gerou.
--
-- Idempotente por construção (ver CLAUDE.md): `prisma migrate dev` faz
-- múltiplas passadas de replay no shadow dentro de uma única invocação.

-- ─── users ganha deleted_at — desligar/demitir é reversível, preserva ──────
-- histórico em user_roles/audit_log. Mesma regra do soft-delete nas tabelas
-- de tenant, agora estendida a toda tabela mutável (ver CLAUDE.md).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- O @unique simples de phone_lookup_hash vira índice único parcial — único
-- só entre linhas vivas, senão um usuário "desligado" trava o telefone dele
-- pra sempre.
DROP INDEX IF EXISTS "users_phone_lookup_hash_key";
CREATE UNIQUE INDEX IF NOT EXISTS "users_active_phone_hash" ON "users" ("phone_lookup_hash") WHERE "deleted_at" IS NULL;

-- ─── tenant_entitlements/tenant_settings: índice parcial por PERFORMANCE, ──
-- não por unicidade. A PK composta (tenant_id, module_key) já garante 0 ou 1
-- linha COM OU SEM soft delete — Postgres não tem PK parcial, então nunca
-- houve risco de duplicata ativa+apagada coexistindo. Este índice é menor e
-- casa exatamente com o padrão de query do ModuleService
-- (WHERE tenant_id=X AND module_key=Y AND deleted_at IS NULL), então o
-- planner tende a preferi-lo ao índice da PK pra essa query específica.
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_entitlements_active_key" ON "tenant_entitlements" ("tenant_id", "module_key") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_settings_active_key" ON "tenant_settings" ("tenant_id", "module_key") WHERE "deleted_at" IS NULL;
