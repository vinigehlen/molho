# @molho/db

Schema Prisma, migrations e client Postgres. RLS por `tenant_id`, PostGIS, roles
`app_migrator`/`app_runtime` — ver CLAUDE.md § Convenções de schema (Postgres).

## Setup de um banco novo (uma vez por ambiente)

1. Conectado como o role admin do Neon (`neondb_owner` ou equivalente), rode
   `prisma/bootstrap.sql`. Ele cria `app_migrator`/`app_runtime` (sem senha),
   instala o PostGIS e dá `CREATE` em `public` pro `app_migrator` — tudo isso
   exige privilégio (`neon_superuser`/dono do schema) que as duas roles de
   aplicação não têm e não devem ter.
2. Sete senha nas duas roles (fora de qualquer arquivo commitado):
   `ALTER ROLE app_migrator PASSWORD '...'; ALTER ROLE app_runtime PASSWORD '...';`
3. Preencha `.env.local`: `DATABASE_URL` = connection string do `app_runtime`
   (é o que a API e os workers usam), `DIRECT_URL` = connection string do
   `app_migrator` (é o que as migrations usam — sem pooler, DDL não combina
   com pgbouncer/transaction pooling).
4. `pnpm --filter @molho/db db:migrate:deploy`.

## Por que a migration não cria as roles/extensão sozinha

`prisma migrate` conecta como `app_migrator`, que **não é dono do schema
`public`** (só tem `USAGE`/`CREATE` nele, sem `GRANT OPTION`). Um
`REVOKE`/`GRANT` de nível de **schema** rodado por quem não é dono é aceito
pelo Postgres sem erro, mas não tem efeito nenhum — por isso essas duas linhas
vivem em `bootstrap.sql`, não na migration. Grant de **tabela** já funciona
normal dentro da migration, porque `app_migrator` é dono das tabelas (ele
mesmo as criou).

## Scripts

- `db:migrate:dev` / `db:migrate:deploy` / `db:migrate:status` — via `DIRECT_URL`.
- `db:generate` — gera o Prisma Client em `prisma/generated/client` (não é
  commitado; roda de novo a cada `build`/`install`).
- `db:studio` — Prisma Studio apontando pro banco de `.env.local`.
