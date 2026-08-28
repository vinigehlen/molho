-- Exceção MVP 2026-08-28 (combos, ver CLAUDE.md) — fase 1: campos aditivos,
-- zero risco pro checkout (nenhuma coluna existente muda de tipo/semântica).
--
-- Escrita à mão em vez de `prisma migrate dev --create-only` porque o
-- migrations/ local está atrás de uma migration já aplicada no banco real
-- (20260820181726_tenant_status_trial, gap conhecido — docs/07); rodar
-- `migrate dev` aqui dispara detecção de drift e oferece reset do banco de
-- verdade. Idempotente (CLAUDE.md § convenções de schema).

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pdv_code" TEXT;

ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "pdv_code" TEXT;
