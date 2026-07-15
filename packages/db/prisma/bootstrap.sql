-- Bootstrap de ambiente — roda UMA VEZ por database, à mão, conectado como o
-- role admin do Neon (ex.: neondb_owner). NÃO faz parte de `prisma migrate` —
-- de propósito: criar role, instalar extensão e dar CREATE em schema exigem
-- privilégio (neon_superuser / dono do schema) que app_migrator não tem e não
-- deve ter. Ver CLAUDE.md § Convenções de schema (Postgres).
--
-- Depois de rodar isto, sete a senha de cada role fora deste arquivo (nunca
-- commitada) e coloque as connection strings resultantes em .env.local:
--   ALTER ROLE app_migrator PASSWORD '<segredo-gerado>';
--   ALTER ROLE app_runtime  PASSWORD '<segredo-gerado>';
--
-- DATABASE_URL (app)       -> app_runtime
-- DIRECT_URL   (migration) -> app_migrator

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator LOGIN CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS postgis;

GRANT USAGE, CREATE ON SCHEMA public TO app_migrator;

-- REVOKE/GRANT de SCHEMA (não de tabela) só funcionam se quem roda for dono
-- do schema (ou tiver GRANT OPTION nele). app_migrator não é dono de
-- `public` — só ganhou USAGE/CREATE acima, sem grant option — então rodar
-- estas duas linhas como app_migrator dentro da migration.sql é um no-op
-- silencioso (Postgres não erra, só ignora). Por isso ficam aqui.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_runtime;
