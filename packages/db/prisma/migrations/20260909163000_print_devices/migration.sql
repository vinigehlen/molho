-- print_devices — credencial do agente de impressão (NG-06).
--
-- Substitui o token de staff (expira ~15min) por uma credencial de DISPOSITIVO:
-- não expira, escopo fixo 'printing', revogável e rotacionável sem afetar
-- sessão de staff. Segredo só em hash (o agente guarda o segredo em claro no
-- PC da loja; o banco nunca).
--
-- Migration EXPANSIVA — não toca print_jobs.
--
-- Idempotente (o `prisma migrate dev` replaya o shadow database várias vezes
-- por invocação — CLAUDE.md § convenções de schema).

-- ─── Tabela ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "print_devices" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    -- Rótulo escolhido no pareamento ("Cozinha", "Balcão").
    "name" TEXT NOT NULL,
    -- Primeiros chars do segredo, em claro: é o que o guard usa pra achar a
    -- linha antes de comparar o hash, e o que a UI mostra ("molho_pd_a1b2…").
    "token_prefix" TEXT NOT NULL,
    -- scrypt(segredo) — nunca o segredo em claro.
    "token_hash" TEXT NOT NULL,
    -- Rotação incrementa; o token antigo para de valer na hora.
    "version" INTEGER NOT NULL DEFAULT 0,
    -- Escopo fixo. Coluna (não constante no código) pra deixar explícito no
    -- dado que a credencial não é de staff e não carrega papel.
    "scope" TEXT NOT NULL DEFAULT 'printing',
    -- Atualizado com throttle (no máx. 1×/60s) — heartbeat do agente.
    "last_seen_at" TIMESTAMP(3),
    -- Revogação: o guard passa a negar imediatamente.
    "revoked_at" TIMESTAMP(3),
    "revoked_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "print_devices_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "print_devices" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- Lookup do guard: (tenant_id, token_prefix) entre dispositivos vivos. Único
-- porque o prefixo vem de 32+ bytes aleatórios — colisão é astronômica, e um
-- prefixo repetido só poderia ser bug de geração.
CREATE UNIQUE INDEX IF NOT EXISTS "print_devices_tenant_id_token_prefix_key"
  ON "print_devices" ("tenant_id", "token_prefix") WHERE "deleted_at" IS NULL;

-- Nome único por tenant entre dispositivos vivos (parcial — soft delete libera
-- o nome).
CREATE UNIQUE INDEX IF NOT EXISTS "print_devices_tenant_id_name_key"
  ON "print_devices" ("tenant_id", "name") WHERE "deleted_at" IS NULL;

-- Listagem no backoffice (começa por tenant_id — CLAUDE.md § convenções).
CREATE INDEX IF NOT EXISTS "print_devices_tenant_id_created_at_idx"
  ON "print_devices" ("tenant_id", "created_at");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "print_devices" ADD CONSTRAINT "print_devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "print_devices" ADD CONSTRAINT "print_devices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "print_devices" ADD CONSTRAINT "print_devices_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "print_devices" ADD CONSTRAINT "print_devices_version_check" CHECK ("version" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

-- FORCE, igual a print_jobs: o guard de auth do agente lê esta tabela num
-- contexto de plataforma (antes de saber o tenant do request), exatamente o
-- padrão "job administrativo" que o CLAUDE.md documenta. Sem FORCE, um erro
-- nesse contexto deixaria o dono (app_migrator) enxergar tudo. Com FORCE,
-- nega por padrão mesmo pro dono. Custo zero pro app_runtime (nunca foi isento).
ALTER TABLE "print_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_devices" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "print_devices";
CREATE POLICY tenant_isolation ON "print_devices"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "print_devices" TO app_runtime;
