-- Prova de RLS do molho-prod, rodada como role app_runtime (sem BYPASSRLS).
-- Tudo dentro de uma transação com ROLLBACK — não persiste nada.
-- Esperado:
--   ctx_A       -> visible = 1, names = ProbeA
--   ctx_B       -> visible = 1, names = ProbeB
--   ctx_unknown -> visible = 0   (fail-closed: contexto aponta tenant inexistente)

BEGIN;

SELECT set_config('app.tenant_id','aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', true);
INSERT INTO tenants (id, slug, name) VALUES ('aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa','rls-probe-a','Probe A');
INSERT INTO categories (tenant_id, name) VALUES ('aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa','ProbeA');

SELECT set_config('app.tenant_id','bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb', true);
INSERT INTO tenants (id, slug, name) VALUES ('bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb','rls-probe-b','Probe B');
INSERT INTO categories (tenant_id, name) VALUES ('bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb','ProbeB');

SELECT set_config('app.tenant_id','aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', true);
SELECT 'ctx_A' AS probe, count(*) AS visible, coalesce(string_agg(name,','),'-') AS names
  FROM categories WHERE name LIKE 'Probe%';

SELECT set_config('app.tenant_id','bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb', true);
SELECT 'ctx_B' AS probe, count(*) AS visible, coalesce(string_agg(name,','),'-') AS names
  FROM categories WHERE name LIKE 'Probe%';

SELECT set_config('app.tenant_id','cccccccc-cccc-7ccc-8ccc-cccccccccccc', true);
SELECT 'ctx_unknown' AS probe, count(*) AS visible FROM categories WHERE name LIKE 'Probe%';

ROLLBACK;
