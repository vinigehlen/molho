-- Épico 13: momento explícito de "Publicar minha loja" no wizard.
--
-- Idempotente (replay do shadow database, CLAUDE.md § convenções de schema).

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "onboarded_at" TIMESTAMP(3);

-- "roxo" era byte-idêntico a "brasa" e foi removido de packages/ui/themes.ts
-- (docs/03-self-setup.md §5, histórico no git). Tenants antigos com
-- theme_key='roxo' continuam funcionando (getTheme() cai no fallback
-- default), mas o default de COLUNA pra tenant novo tem que apontar pro
-- template que existe de verdade.
ALTER TABLE "tenants"
  ALTER COLUMN "theme_key" SET DEFAULT 'brasa';
