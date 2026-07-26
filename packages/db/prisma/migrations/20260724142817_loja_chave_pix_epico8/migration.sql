-- CreateEnum
CREATE TYPE "PixKeyType" AS ENUM ('cpf', 'cnpj', 'email', 'phone', 'random');

-- AlterTable
-- Falso drift removido (composite FKs/índices id_tenant_id escritos à mão em
-- migrations anteriores, e ALTER COLUMN updated_at DROP DEFAULT em tabelas
-- @updatedAt — ver CLAUDE.md "Convenções de schema" pro porquê de ambos
-- serem ruído do diff, não mudança real).
ALTER TABLE "stores"
  ADD COLUMN "pix_key" TEXT,
  ADD COLUMN "pix_key_type" "PixKeyType",
  ADD COLUMN "pix_merchant_city" TEXT;
