import { defineConfig, env } from 'prisma/config';

// Migrations conectam via DIRECT_URL (sem pooler) — DDL e advisory locks não
// se dão bem com pgbouncer/transaction pooling. O app conecta com a
// connection string que passar para createPrismaClient() (ver src/index.ts),
// tipicamente DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
    // `prisma migrate dev` replaya todo o histórico de migrations num shadow
    // database pra detectar drift. O shadow AUTO-criado pelo Prisma é uma
    // instância nova/vazia — sem PostGIS, e a migration `init` usa
    // geography(Point,4326), então o replay falhava com
    // "type geography does not exist". NEONDB_SHADOW_URL aponta pra um banco
    // persistente com PostGIS pré-instalado (ver docs/setup-shadow-database.md)
    // — resolve isso de vez, não é mais preciso escrever migration à mão por
    // causa disso.
    shadowDatabaseUrl: env('NEONDB_SHADOW_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
