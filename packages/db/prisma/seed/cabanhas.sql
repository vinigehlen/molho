-- Hand-seed da Cabanhas (Bloco 4) — loja, zonas por cidade e horários.
--
-- Rodar como app_migrator (dono das tabelas) OU como app_runtime: o
-- `SET LOCAL app.tenant_id` abaixo satisfaz a RLS nos dois casos.
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f packages/db/prisma/seed/cabanhas.sql
--
-- Idempotente: rodar duas vezes não duplica nada.
-- CNPJ não é tocado aqui (segue fake, decisão do bloco).

BEGIN;

SET LOCAL app.tenant_id = '019fa903-04e5-7755-8102-b176b2e0775f';

-- ─── Loja ────────────────────────────────────────────────────────────────────
--
-- Ponto GEOCODADO À MÃO (Nominatim/OSM, 2026-08-08) e gravado como literal:
-- seed não chama serviço externo. Revisável — confira antes de rodar.
--
--   "Av. Brasil 1684, Estância Velha - RS"  →  -29.6558617, -51.1863222
--
-- ⚠ PRECISÃO É DE SEGMENTO DE RUA, NÃO DE NÚMERO: o OSM não tem o número
-- 1684 (nem interpolação) nessa avenida — o ponto é o centroide do trecho
-- da Av. Brasil no bairro Bela Vista (CEP 93614-810, "lado par", que é onde
-- um número par como 1684 cai segundo o ViaCEP). Os outros trechos da mesma
-- avenida ficam a até ~3 km daqui (Centro: -29.6545885,-51.1676361).
-- Isso NÃO afeta a taxa de entrega: as 4 zonas abaixo são por CIDADE, não
-- por raio — `geo` só entraria no match se houvesse zona com polígono.
-- Corrigir o par se/quando alguém abrir o mapa e apontar a porta.
UPDATE "stores"
SET "address_text" = 'Av. Brasil, 1684 - Bela Vista, Estância Velha - RS',
    "geo"          = ST_SetSRID(ST_MakePoint(-51.1863222, -29.6558617), 4326)::geography,
    "updated_at"   = now()
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL;

-- Falha alto se a loja não existir (UPDATE de 0 linhas é silencioso, e os
-- INSERTs abaixo dependem dela).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "stores"
    WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f' AND "deleted_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Nenhuma loja ativa no tenant 019fa903-04e5-7755-8102-b176b2e0775f';
  END IF;
END $$;

-- ─── Zonas: reset do que não é das 4 cidades ─────────────────────────────────
--
-- O tenant da Cabanhas herdou a `Zona padrão (10km)` do `pnpm db:seed`
-- (`seed/delivery.ts`): zona por RAIO — `city IS NULL`, `polygon NOT NULL`,
-- R$8, ETA 30–50. O ON CONFLICT abaixo NUNCA a alcança (a chave dele é
-- (tenant, loja, cidade, UF) e zona por polígono não entra no índice
-- parcial), então ela sobrevive a qualquer re-seed. Daí este passo.
--
-- Ela não estava cobrando errado nas 4 cidades — o match ordena
-- `("city" IS NULL) ASC`, cidade sempre ganha de polígono. O estrago é
-- FORA delas: qualquer endereço a até 10 km da loja e sem zona de cidade
-- (Campo Bom, Dois Irmãos, Sapiranga…) entrava como entregável a R$8.
--
-- Soft delete (convenção do CLAUDE.md), não DELETE: o índice único parcial
-- é `WHERE deleted_at IS NULL`, então a linha apagada não trava nada.
UPDATE "delivery_zones"
SET "deleted_at" = now(),
    "updated_at" = now(),
    "version"    = "version" + 1
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL
  AND NOT (
        "city" IS NOT NULL
    AND upper(btrim("state")) = 'RS'
    AND molho_city_key("city") IN (
          molho_city_key('Estância Velha'),
          molho_city_key('Portão'),
          molho_city_key('Ivoti'),
          molho_city_key('Novo Hamburgo')
        )
  );

-- ─── Zonas por cidade ────────────────────────────────────────────────────────
--
-- Taxa fixa por município (city XOR polygon — CHECK
-- `delivery_zones_city_xor_polygon`). `priority` fica 0 em todas: não há
-- sobreposição entre municípios.
--
-- O ON CONFLICT mira o índice único parcial expressional
-- `delivery_zones_tenant_store_city_key` — a lista de expressões e o WHERE
-- têm que bater com os da migration, senão o Postgres não acha o índice.
INSERT INTO "delivery_zones" (
  "tenant_id", "store_id", "name", "city", "state",
  "fee_cents", "eta_min_minutes", "eta_max_minutes", "priority", "updated_at"
)
SELECT
  s."tenant_id", s."id", z.city, z.city, 'RS',
  z.fee, z.eta_min, z.eta_max, 0, now()
FROM "stores" s
CROSS JOIN (VALUES
  ('Estância Velha',  800, 30, 45),
  ('Portão',         1500, 45, 70),
  ('Ivoti',          1500, 45, 70),
  ('Novo Hamburgo',  1500, 45, 70)
) AS z(city, fee, eta_min, eta_max)
WHERE s."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND s."deleted_at" IS NULL
ON CONFLICT ("tenant_id", "store_id", molho_city_key("city"), upper(btrim("state")))
  WHERE "deleted_at" IS NULL AND "city" IS NOT NULL
DO UPDATE SET
  "name"            = EXCLUDED."name",
  "fee_cents"       = EXCLUDED."fee_cents",
  "eta_min_minutes" = EXCLUDED."eta_min_minutes",
  "eta_max_minutes" = EXCLUDED."eta_max_minutes",
  "priority"        = EXCLUDED."priority",
  "version"         = "delivery_zones"."version" + 1,
  "updated_at"      = now();

-- ─── Horários ────────────────────────────────────────────────────────────────
--
-- Sáb e dom 11h–14h (660–840 min). Seg–sex fechado = AUSÊNCIA de linha,
-- não linha com 0–0 (o CHECK opens <> closes recusaria, e "aberto agora" é
-- "existe turno que cobre".)
--
-- Reset antes de inserir: store_hours não tem único por (loja, dia), então
-- idempotência aqui é apagar e reescrever. DELETE de verdade, não soft: é
-- linha de hand-seed, não histórico de negócio.
DELETE FROM "store_hours"
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f';

INSERT INTO "store_hours" (
  "tenant_id", "store_id", "day_of_week", "opens_at_minutes", "closes_at_minutes", "updated_at"
)
SELECT s."tenant_id", s."id", d.dia::"DayOfWeek", 660, 840, now()
FROM "stores" s
CROSS JOIN (VALUES ('saturday'), ('sunday')) AS d(dia)
WHERE s."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND s."deleted_at" IS NULL;

-- ─── Conferência (sai no output do psql) ─────────────────────────────────────
SELECT "address_text", ST_Y("geo"::geometry) AS lat, ST_X("geo"::geometry) AS lng
FROM "stores"
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f' AND "deleted_at" IS NULL;

-- `coalesce` + `tipo` explícitos: o psql imprime NULL como string VAZIA, e
-- foi exatamente isso que fez a zona por raio herdada do db:seed passar por
-- "zona com city em branco". Nunca mais conferir zona sem olhar o polygon.
SELECT
  coalesce("city", '‹NULL›')                                     AS "city",
  coalesce("state", '‹NULL›')                                    AS "state",
  CASE WHEN "polygon" IS NULL THEN 'cidade' ELSE 'POLÍGONO' END  AS "tipo",
  "fee_cents", "eta_min_minutes", "eta_max_minutes"
FROM "delivery_zones"
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f' AND "deleted_at" IS NULL
ORDER BY "fee_cents", "city";

-- Aborta a transação se não sobrarem exatamente as 4 zonas por cidade.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "delivery_zones"
  WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f' AND "deleted_at" IS NULL;
  IF n <> 4 THEN
    RAISE EXCEPTION 'Esperava 4 zonas ativas, achei %', n;
  END IF;
END $$;

SELECT "day_of_week", "opens_at_minutes", "closes_at_minutes"
FROM "store_hours"
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f' AND "deleted_at" IS NULL
ORDER BY "day_of_week";

COMMIT;
