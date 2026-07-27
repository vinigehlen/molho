-- Idempotência da fila offline do gestor (Épico 9).
--
-- ATENÇÃO: a migration que o `prisma migrate dev --create-only` gerou vinha
-- cheia de DROP das FKs compostas (id, tenant_id), índices únicos parciais e o
-- índice GiST — "drift" porque esse SQL à mão não vive no schema.prisma
-- (complexidade deliberada, CLAUDE.md). Aplicá-la destruiria os guardrails de
-- tenant. Substituído pelo que de fato se quer, idempotente (docs/07).

-- Coluna: chave de idempotência por intent enfileirado (nula em ação online direta).
ALTER TABLE "order_status_history" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

-- Índice único PARCIAL: um intent (order_id + idempotency_key) só aplica uma
-- vez — o retry cuja resposta se perdeu colide aqui e o service devolve "já
-- aplicado". Parcial (WHERE ... IS NOT NULL) pra as transições SEM chave (ação
-- online direta) não colidirem entre si. SQL à mão, nunca do schema.prisma.
CREATE UNIQUE INDEX IF NOT EXISTS "order_status_history_order_id_idempotency_key_key"
  ON "order_status_history" ("order_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
