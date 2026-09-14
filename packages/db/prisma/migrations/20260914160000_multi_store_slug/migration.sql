-- Multi-loja (Épico multi_store, PR1 backend+admin) — docs/01-plano-produto.md.
--
-- `slug` identifica a loja publicamente (PR2 monta a URL pública
-- `/<tenant-slug>/<store-slug>` em cima dele) e é o seletor estável no
-- backoffice. `is_primary` é a loja que ainda recebe quem chega só pelo
-- slug do TENANT (rota pública legada `/<tenant-slug>`, compat com todo
-- link já compartilhado hoje).
--
-- Backfill: hoje todo tenant tem NO MÁXIMO 1 loja (confirmado antes desta
-- migration — signup/platform-provisioning só criam uma). slug herda o
-- slug do próprio tenant (era a única loja, o link público já apontava pra
-- ela) e ganha is_primary=true. O `row_number()` no backfill de slug é
-- defesa em profundidade caso essa invariante um dia já tenha sido violada
-- por alguma linha órfã — nunca deixa dois slugs colidirem no UPDATE.
--
-- Índices únicos parciais à mão (Prisma DSL não expressa WHERE) — mesmo
-- padrão de users.email_lookup_hash: únicos só entre linhas vivas.
--
-- Idempotente (CLAUDE.md § convenções de schema).

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "slug" TEXT;

WITH ranked AS (
  SELECT
    s.id,
    t.slug || CASE
      WHEN row_number() OVER (PARTITION BY s.tenant_id ORDER BY s.created_at) = 1 THEN ''
      ELSE '-' || row_number() OVER (PARTITION BY s.tenant_id ORDER BY s.created_at)
    END AS new_slug
  FROM "stores" s
  JOIN "tenants" t ON t.id = s.tenant_id
  WHERE s.slug IS NULL
)
UPDATE "stores" SET "slug" = ranked.new_slug FROM ranked WHERE "stores"."id" = ranked.id;

ALTER TABLE "stores" ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;

UPDATE "stores" s SET "is_primary" = true
WHERE s.deleted_at IS NULL
  AND s.created_at = (
    SELECT MIN(s2.created_at) FROM "stores" s2 WHERE s2.tenant_id = s.tenant_id AND s2.deleted_at IS NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS "stores_tenant_id_slug_active_key" ON "stores" ("tenant_id", "slug") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "stores_tenant_id_primary_active_key" ON "stores" ("tenant_id") WHERE "is_primary" = true AND "deleted_at" IS NULL;
