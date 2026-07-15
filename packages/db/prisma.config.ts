import { defineConfig, env } from 'prisma/config';

// Migrations conectam via DIRECT_URL (sem pooler) — DDL e advisory locks não
// se dão bem com pgbouncer/transaction pooling. O app conecta com a
// connection string que passar para createPrismaClient() (ver src/index.ts),
// tipicamente DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
