-- Caixa obrigatório opcional (Épico 20 follow-up): lojista desliga em
-- Configuração quando não quer o bloqueio de abrir caixa antes de vender.
-- Default true preserva o comportamento atual (caixa sempre obrigatório).
--
-- Idempotente (CLAUDE.md § convenções de schema).

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "cash_session_required" BOOLEAN NOT NULL DEFAULT true;
