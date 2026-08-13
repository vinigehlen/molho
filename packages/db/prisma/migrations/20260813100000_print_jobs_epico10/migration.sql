-- Fila de impressão (Épico 10, ESC/POS) — só a tabela. O worker que consome
-- (SELECT ... FOR UPDATE SKIP LOCKED pro claim, optimistic lock no update de
-- conclusão) vive em apps/api/src/printing/, módulo de outro agente
-- (branch epico-10-escpos) — este pacote entrega só o schema.
--
-- Idempotente (o `prisma migrate dev` replaya o shadow database várias vezes
-- por invocação — CLAUDE.md § convenções de schema).

-- ─── Tipos ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PrintJobStatus" AS ENUM ('queued', 'printing', 'printed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tabela ──────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE IF NOT EXISTS "print_jobs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    -- Par com tenant_id no UNIQUE — reenvio do módulo consumidor (retry de
    -- rede, reconexão do agente) não duplica o job.
    "idempotency_key" TEXT NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'queued',
    -- Conteúdo já renderizado (snapshot) — mesmo princípio de order_items.name.
    "ticket_text" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    -- Sem DEFAULT: decisão explícita de quem cria o job, nunca cai em
    -- cortar (ou não) o papel por omissão.
    "cut" BOOLEAN NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    -- NULL = não leaseado. Setado/limpo junto com leased_by no claim/release
    -- do worker (SELECT ... FOR UPDATE SKIP LOCKED).
    "lease_until" TIMESTAMP(3),
    -- Id do worker — opaco pro schema. Usado no WHERE do update de conclusão
    -- (WHERE id = ? AND version = ? AND status = 'printing' AND leased_by = ?)
    -- pra barrar worker zumbi pós-lease-expirado escrevendo por cima de quem
    -- reivindicou depois. SKIP LOCKED resolve a corrida de CLAIM; esta coluna
    -- + version resolvem a corrida de CONCLUSÃO — não são redundantes.
    "leased_by" TEXT,
    "last_error" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "printed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- Mesma rede de segurança de sempre (ver orders) — updated_at ganha DEFAULT
-- fora do CREATE TABLE.
ALTER TABLE "print_jobs" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- Idempotência: um (tenant, idempotency_key) só existe uma vez. Não-parcial
-- de propósito — idempotency_key é NOT NULL sempre, diferente do padrão
-- parcial de order_status_history.idempotency_key (lá é nullable).
CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_tenant_id_idempotency_key_key" ON "print_jobs"("tenant_id", "idempotency_key");

-- FIFO dos pendentes — começa por tenant_id (CLAUDE.md § convenções de
-- schema), parcial pra não indexar printing/printed/failed (o worker só
-- escaneia fila de espera, nunca o histórico inteiro).
CREATE INDEX IF NOT EXISTS "print_jobs_tenant_id_created_at_queued_idx" ON "print_jobs"("tenant_id", "created_at") WHERE "status" = 'queued' AND "deleted_at" IS NULL;

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Composta (guardrail contra tenant_id inconsistente, mesmo padrão de
-- order_items → orders): job não pode apontar pra pedido de OUTRO tenant
-- mesmo com bug de aplicação. orders(id, tenant_id) já existe como alvo
-- (migration do Épico 7).
DO $$ BEGIN
  ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_tenant_id_fkey" FOREIGN KEY ("order_id", "tenant_id") REFERENCES "orders"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Checks de negócio ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_width_check" CHECK ("width" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_attempts_check" CHECK ("attempts" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

-- print_jobs é mutável (status/attempts/lease_until/version mudam) — uma
-- policy só, mesmo padrão de orders. FORCE (diferente de orders e de toda
-- outra tabela do schema até hoje): Postgres nunca aplica RLS ao DONO da
-- tabela (app_migrator), com ou sem ENABLE — só FORCE fecha isso. O
-- consumidor (apps/api/src/printing/) é um WORKER de fila (claim/lease),
-- código com chance real de rodar no padrão "job administrativo" que o
-- CLAUDE.md já documenta (app_migrator + client global + contexto de
-- tenant explícito próprio, sem passar pelo RequestContextService de
-- request path) — se esse contexto for esquecido ou errado, sem FORCE o
-- banco deixaria passar (dono sempre isento); com FORCE, nega por padrão,
-- mesmo pro dono. Custo zero pro caminho certo: app_runtime nunca foi
-- isento, FORCE não muda nada pra ele.
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "print_jobs";
CREATE POLICY tenant_isolation ON "print_jobs"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

-- Grant explícito (mesmo padrão de orders — tabela mutável).
GRANT SELECT, INSERT, UPDATE, DELETE ON "print_jobs" TO app_runtime;
