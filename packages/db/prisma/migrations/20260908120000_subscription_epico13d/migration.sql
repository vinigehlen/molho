-- Épico 13d: ciclo de vida da assinatura, cobrança MANUAL no piloto
-- (CLAUDE.md, 2026-09-04 — sem PSP recorrente ainda, isso só entra nos
-- épicos 24-26). O que este épico automatiza é o CICLO: trial expira
-- sozinho, atraso vira suspensão depois de uma folga, cancelamento em 2
-- cliques — a cobrança em si continua sendo o super-admin confirmando "recebi
-- o PIX/boleto" na mão.
--
-- Sozinho nesta migration DE PROPÓSITO: `ALTER TYPE ... ADD VALUE` precisa
-- commitar antes de o valor novo poder ser usado numa expressão — mesmo
-- racional de 20260816120000_metodos_pagamento_balcao. As colunas novas
-- abaixo não referenciam os valores novos em nenhuma expressão (CHECK etc.),
-- então cabem na mesma migration sem violar essa regra.
--
-- Idempotente: `ADD VALUE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`
-- (replay do shadow database, CLAUDE.md § convenções de schema).

ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'past_due';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'canceled';

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "current_period_end_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "past_due_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "canceled_at" TIMESTAMP(3);
