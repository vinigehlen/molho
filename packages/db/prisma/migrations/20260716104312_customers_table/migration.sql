-- Nota: o Prisma detectou "drift" nos 7 ALTER COLUMN updated_at SET DEFAULT
-- adicionados à mão no Épico 2 (não existem no schema.prisma — @updatedAt
-- não vira DEFAULT de banco) e gerou DROP DEFAULT pra "corrigir". Removido
-- de propósito: aquele DEFAULT é rede de segurança pra escrita fora do
-- Prisma Client (seed, fix manual), não drift de verdade. Vai reaparecer em
-- toda migration futura que o Prisma gerar — remover sempre à mão.

-- CreateTable
CREATE TABLE IF NOT EXISTS "customers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone_ciphertext" BYTEA NOT NULL,
    "phone_lookup_hash" TEXT NOT NULL,
    "phone_key_version" INTEGER NOT NULL DEFAULT 1,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customers_tenant_id_idx" ON "customers"("tenant_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Mesma rede de segurança do Épico 2 (@updatedAt não vira DEFAULT sozinho).
ALTER TABLE "customers" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ─── Índice único parcial: telefone único só entre linhas vivas E só ────────
-- dentro do tenant (Prisma não expressa índice parcial no DSL — ver
-- schema.prisma). É o que diferencia Customer de User: o mesmo telefone em
-- dois tenants é dois registros isolados de propósito (CLAUDE.md).
CREATE UNIQUE INDEX IF NOT EXISTS "customers_active_phone_hash" ON "customers" ("tenant_id", "phone_lookup_hash") WHERE "deleted_at" IS NULL;

-- ─── RLS: tenant-scoped, mutável — mesma família de stores/tenant_settings ──
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "customers";
CREATE POLICY tenant_isolation ON "customers"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

-- Grant de tabela nova — o ALTER DEFAULT PRIVILEGES da migration `init` já
-- cobre isto automaticamente (é por isso que existe), mas explícito não
-- custa nada e documenta a intenção nesta migration especificamente.
GRANT SELECT, INSERT, UPDATE, DELETE ON "customers" TO app_runtime;
