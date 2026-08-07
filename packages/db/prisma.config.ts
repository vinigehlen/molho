import { defineConfig, env } from 'prisma/config';

// Migrations conectam via DIRECT_URL (sem pooler) — DDL e advisory locks não
// se dão bem com pgbouncer/transaction pooling. O app conecta com a
// connection string que passar para createPrismaClient() (ver src/index.ts),
// tipicamente DATABASE_URL.

const directUrl = process.env.DIRECT_URL;
const shadowUrl = process.env.NEONDB_SHADOW_URL;

// O shadow tem que ser outro BANCO no MESMO projeto Neon. As duas violações
// possíveis já morderam de verdade, e as duas se apresentaram como erro de
// autenticação sem relação aparente:
//
// - Host diferente: depois da migração de us-east-1 pra sa-east-1, a
//   NEONDB_SHADOW_URL ficou apontando pro projeto aposentado. `migrate dev`
//   replayaria o histórico e calcularia drift contra OUTRO projeto,
//   concluindo errado em silêncio.
// - Mesmo banco do DIRECT_URL: `migrate dev` RESETARIA o banco real achando
//   que é shadow descartável. O Prisma já aborta nesse caso — a assertiva
//   aqui só troca a mensagem dele pela instrução do que fazer.
if (shadowUrl && directUrl) {
  const shadow = new URL(shadowUrl);
  const direct = new URL(directUrl);
  if (shadow.hostname !== direct.hostname) {
    throw new Error(
      `NEONDB_SHADOW_URL aponta pra outro host (${shadow.hostname}) que o DIRECT_URL (${direct.hostname}). ` +
        'O shadow tem que ser outro BANCO no MESMO projeto Neon — ver docs/setup-shadow-database.md.',
    );
  }
  if (shadow.pathname === direct.pathname) {
    throw new Error(
      `NEONDB_SHADOW_URL e DIRECT_URL apontam pro mesmo banco (${direct.pathname.slice(1)}). ` +
        '`prisma migrate dev` RESETARIA o banco real. Criar o neondb_shadow — ver docs/setup-shadow-database.md.',
    );
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
    // `prisma migrate dev` replaya todo o histórico de migrations num shadow
    // database pra detectar drift. O shadow AUTO-criado pelo Prisma é uma
    // instância nova/vazia — sem PostGIS, e a migration `init` usa
    // geography(Point,4326), então o replay falhava com
    // "type geography does not exist". NEONDB_SHADOW_URL aponta pra um banco
    // persistente com PostGIS pré-instalado (ver docs/setup-shadow-database.md).
    //
    // DECLARADO CONDICIONALMENTE de propósito: o Prisma VALIDA o shadow ao
    // carregar a config, inclusive no `migrate deploy`, que não o usa pra
    // nada. Com a var ausente, deploy/generate/status rodam sem exigir
    // shadow nenhum — só `migrate dev`/`reset` precisam dele de verdade.
    ...(shadowUrl ? { shadowDatabaseUrl: shadowUrl } : {}),
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
