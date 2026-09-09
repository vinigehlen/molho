// Prova de RLS do molho-prod como role app_runtime (sem BYPASSRLS).
// Roda dentro de uma transação com ROLLBACK — não persiste nada.
// Uso: node docs/go-live/rls-probe.mjs   (com PSQL_RUNTIME_URL no ambiente)
import { createRequire } from 'node:module';
const require = createRequire('/Users/vgehlen/Documents/Claude Projects/Molho - Delivery/molho-repo/packages/db/');
const { Client } = require('pg');

const A = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-7ccc-8ccc-cccccccccccc';

const url = process.env.PSQL_RUNTIME_URL || process.env.DATABASE_URL;
const client = new Client({ connectionString: url.replace(/[?&]pgbouncer=true/, '') });

const q = (sql, params) => client.query(sql, params);

await client.connect();
try {
  const who = await q('select current_user, current_setting(\'is_superuser\') as super');
  console.log('conectado como:', who.rows[0]);

  await q('begin');
  await q(`select set_config('app.tenant_id', $1, true)`, [A]);
  await q(`insert into tenants (id, slug, name) values ($1,'rls-probe-a','Probe A')`, [A]);
  await q(`insert into categories (tenant_id, name) values ($1,'ProbeA')`, [A]);

  await q(`select set_config('app.tenant_id', $1, true)`, [B]);
  await q(`insert into tenants (id, slug, name) values ($1,'rls-probe-b','Probe B')`, [B]);
  await q(`insert into categories (tenant_id, name) values ($1,'ProbeB')`, [B]);

  await q(`select set_config('app.tenant_id', $1, true)`, [A]);
  const ctxA = await q(`select count(*)::int visible, coalesce(string_agg(name,','),'-') names from categories where name like 'Probe%'`);
  console.log('ctx_A      ->', ctxA.rows[0], ctxA.rows[0].visible === 1 && ctxA.rows[0].names === 'ProbeA' ? 'OK' : 'FALHOU');

  await q(`select set_config('app.tenant_id', $1, true)`, [B]);
  const ctxB = await q(`select count(*)::int visible, coalesce(string_agg(name,','),'-') names from categories where name like 'Probe%'`);
  console.log('ctx_B      ->', ctxB.rows[0], ctxB.rows[0].visible === 1 && ctxB.rows[0].names === 'ProbeB' ? 'OK' : 'FALHOU');

  await q(`select set_config('app.tenant_id', $1, true)`, [C]);
  const ctxU = await q(`select count(*)::int visible from categories where name like 'Probe%'`);
  console.log('ctx_unknown->', ctxU.rows[0], ctxU.rows[0].visible === 0 ? 'OK (fail-closed)' : 'FALHOU');

  // negativo: gravar linha de outro tenant deve violar o WITH CHECK
  await q(`select set_config('app.tenant_id', $1, true)`, [A]);
  let wroteCrossTenant = false;
  try {
    await q(`insert into categories (tenant_id, name) values ($1,'ProbeCross')`, [B]);
    wroteCrossTenant = true;
  } catch (e) {
    console.log('ctx_A grava tenant B ->', e.code, e.message.split('\n')[0], 'OK (bloqueado)');
  }
  if (wroteCrossTenant) console.log('ctx_A grava tenant B -> FALHOU (gravou)');

  await q('rollback');
  console.log('rollback feito — nada persistido');
} finally {
  await client.end();
}
