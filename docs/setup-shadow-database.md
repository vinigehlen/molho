# Setup do shadow database (`prisma migrate dev`)

## Por quê

`prisma migrate dev` replaya todo o histórico de migrations num "shadow
database" pra detectar drift antes de gerar uma nova migration. Por padrão,
o Prisma cria esse shadow automaticamente (usando `CREATEDB` do role
conectado) — mas é sempre uma instância **nova e vazia**. A migration `init`
deste projeto usa `geography(Point, 4326)` (PostGIS) na tabela `stores`, e
replayar ela num banco sem a extensão falha com:

```
ERROR: type "geography" does not exist
```

A solução é ter um shadow **persistente**, com PostGIS já instalado, e
apontar `NEONDB_SHADOW_URL` pra ele — feito uma vez por ambiente, nunca
mais precisa se repetir.

## Passo a passo (uma vez por ambiente/projeto Neon)

Rodar os três primeiros passos conectado como o role admin do Neon
(`neondb_owner` ou equivalente — o mesmo usado em `prisma/bootstrap.sql`).
`app_migrator` **não** tem privilégio pra nenhum dos três (precisa de
`neon_superuser`/dono do banco).

```sql
-- 1. Cria o banco (uma vez).
CREATE DATABASE neondb_shadow OWNER neondb_owner;

-- 2. Instala PostGIS nele (precisa neon_superuser — conectar EM neondb_shadow).
CREATE EXTENSION IF NOT EXISTS postgis;

-- 3. Dá pro app_migrator o mesmo USAGE/CREATE que ele tem no banco real
--    (ainda conectado em neondb_shadow).
GRANT USAGE, CREATE ON SCHEMA public TO app_migrator;
```

4. Em `.env.local`, adicione (mesma senha do `app_migrator` que já está em
   `DIRECT_URL`, só troca o nome do banco no final da URL):

```bash
NEONDB_SHADOW_URL="postgresql://app_migrator:<senha>@<host>/neondb_shadow?sslmode=require"
```

5. Pronto. `pnpm --filter @molho/db db:migrate:dev` volta a funcionar normal
   — sem precisar escrever migration à mão por causa do PostGIS.

## Se `prisma migrate dev` continuar falhando

O shadow é **replayado do zero a cada rodada** (Prisma reseta o schema
`public` dele antes de reaplicar o histórico) — ele nunca deve acumular
dado nem drift próprio. Se algo parecer inconsistente nele, o mais simples
é derrubar e recriar (`DROP DATABASE neondb_shadow;` e repetir os passos
1–3) — ele não guarda nada que precise ser preservado.
