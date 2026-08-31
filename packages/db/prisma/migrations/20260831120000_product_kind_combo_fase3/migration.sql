-- Exceção MVP 2026-08-28 (combos, ver CLAUDE.md) — fase 3: discriminador
-- `Product.kind`. Aditivo, zero risco pro checkout — nenhuma coluna existente
-- muda de tipo/semântica e o default cobre toda linha atual. O comportamento
-- de combo de verdade entra na fase 4; aqui só nasce o rótulo.
--
-- Escrita à mão (mesmo motivo das migrations de combo fase 1/2): o migrations/
-- local está atrás de migrations já aplicadas no banco real; `migrate dev`
-- dispara detecção de drift. Idempotente (CLAUDE.md § convenções de schema).

DO $$ BEGIN
  CREATE TYPE "ProductKind" AS ENUM ('prepared', 'industrialized', 'combo');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "kind" "ProductKind" NOT NULL DEFAULT 'prepared';
