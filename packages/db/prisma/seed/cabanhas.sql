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

-- ─── Catálogo: reset + combos iniciais ──────────────────────────────────────
--
-- "Limpar tudo" aqui significa substituir o catálogo ATIVO do tenant sem
-- apagar histórico: soft-delete em categorias, produtos, ofertas,
-- componentes, imagens e complementos. Reaplicar este bloco deixa o catálogo
-- ativo no mesmo estado, embora preserve linhas antigas como deletadas.
UPDATE "combo_items"
SET "deleted_at" = now(),
    "updated_at" = now(),
    "version"    = "version" + 1
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL;

UPDATE "modifiers"
SET "deleted_at" = now(),
    "updated_at" = now(),
    "version"    = "version" + 1
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL;

UPDATE "product_modifier_groups"
SET "deleted_at" = now(),
    "updated_at" = now()
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL;

UPDATE "modifier_groups"
SET "deleted_at" = now(),
    "updated_at" = now(),
    "version"    = "version" + 1
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL;

UPDATE "product_images"
SET "deleted_at" = now(),
    "updated_at" = now(),
    "version"    = "version" + 1
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL;

UPDATE "product_offers"
SET "deleted_at" = now(),
    "updated_at" = now(),
    "version"    = "version" + 1
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL;

UPDATE "products"
SET "deleted_at" = now(),
    "updated_at" = now(),
    "version"    = "version" + 1
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL;

UPDATE "categories"
SET "deleted_at" = now(),
    "updated_at" = now(),
    "version"    = "version" + 1
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL;

CREATE TEMP TABLE _cabanhas_catalog_ids (
  "key" text PRIMARY KEY,
  "id" uuid NOT NULL
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO "categories" (
    "tenant_id", "name", "sort_order", "visible", "updated_at"
  )
  VALUES
    ('019fa903-04e5-7755-8102-b176b2e0775f', 'Combos', 0, true, now()),
    ('019fa903-04e5-7755-8102-b176b2e0775f', 'Porções', 1, true, now()),
    ('019fa903-04e5-7755-8102-b176b2e0775f', 'Hambúrgueres', 2, true, now()),
    ('019fa903-04e5-7755-8102-b176b2e0775f', 'Itens dos combos', 3, false, now())
  RETURNING "id", "name"
)
INSERT INTO _cabanhas_catalog_ids ("key", "id")
SELECT 'category:' || "name", "id" FROM inserted;

WITH components("name", "sort_order") AS (
  VALUES
    ('pedaço de coxa', 0),
    ('pedaço de sobrecoxa', 1),
    ('350g de massa', 2),
    ('350g de polenta frita', 3),
    ('350g de maionese de batata', 4),
    ('500g de vazio', 5),
    ('400g de arroz', 6),
    ('350g de batata frita', 7),
    ('porção de Salada de Alface e Tomate', 8),
    ('500g de maminha', 9),
    ('500g de picanha', 10),
    ('500g de entrecot', 11),
    ('500g de alcatra', 12),
    ('500g de assado de tiras', 13)
),
inserted AS (
  INSERT INTO "products" (
    "tenant_id", "category_id", "name", "description", "base_price_cents",
    "available", "kind", "sort_order", "updated_at"
  )
  SELECT
    '019fa903-04e5-7755-8102-b176b2e0775f',
    ids."id",
    c."name",
    NULL,
    0,
    true,
    'prepared'::"ProductKind",
    c."sort_order",
    now()
  FROM components c
  CROSS JOIN _cabanhas_catalog_ids ids
  WHERE ids."key" = 'category:Itens dos combos'
  RETURNING "id", "name"
)
INSERT INTO _cabanhas_catalog_ids ("key", "id")
SELECT 'component:' || "name", "id" FROM inserted;

WITH combos("name", "description", "price_cents", "sort_order") AS (
  VALUES
    (
      'KIT GALETO',
      '3 pedaços de coxa, 3 pedaços de sobrecoxa, 350g de massa, 350g de polenta frita, 350g de maionese de batata e 1 molho à escolha.',
      9190,
      0
    ),
    (
      'KIT VAZIO',
      '500g de vazio, 400g de arroz, 350g de batata frita, 350g de maionese de batata e 1 porção de Salada de Alface e Tomate.',
      16990,
      1
    ),
    (
      'KIT MAMINHA',
      '500g de maminha, 400g de arroz, 350g de batata frita, 350g de maionese de batata e 1 porção de Salada de Alface e Tomate.',
      16490,
      2
    ),
    (
      'KIT PICANHA',
      '500g de picanha, 400g de arroz, 350g de batata frita, 350g de maionese de batata e 1 porção de Salada de Alface e Tomate.',
      21990,
      3
    ),
    (
      'KIT ENTRECOT',
      '500g de entrecot, 400g de arroz, 350g de batata frita, 350g de maionese de batata e 1 porção de Salada de Alface e Tomate.',
      21290,
      4
    ),
    (
      'KIT ALCATRA',
      '500g de alcatra, 400g de arroz, 350g de batata frita, 350g de maionese de batata e 1 porção de Salada de Alface e Tomate.',
      16990,
      5
    ),
    (
      'KIT ASSADO DE TIRAS',
      '500g de assado de tiras, 400g de arroz, 350g de batata frita, 350g de maionese de batata e 1 porção de Salada de Alface e Tomate.',
      19990,
      6
    )
),
inserted AS (
  INSERT INTO "products" (
    "tenant_id", "category_id", "name", "description", "base_price_cents",
    "available", "kind", "sort_order", "updated_at"
  )
  SELECT
    '019fa903-04e5-7755-8102-b176b2e0775f',
    ids."id",
    c."name",
    c."description",
    c."price_cents",
    true,
    'combo'::"ProductKind",
    c."sort_order",
    now()
  FROM combos c
  CROSS JOIN _cabanhas_catalog_ids ids
  WHERE ids."key" = 'category:Combos'
  RETURNING "id", "name"
)
INSERT INTO _cabanhas_catalog_ids ("key", "id")
SELECT 'combo:' || "name", "id" FROM inserted;

WITH composition("combo", "component", "quantity", "sort_order") AS (
  VALUES
    ('KIT GALETO', 'pedaço de coxa', 3, 0),
    ('KIT GALETO', 'pedaço de sobrecoxa', 3, 1),
    ('KIT GALETO', '350g de massa', 1, 2),
    ('KIT GALETO', '350g de polenta frita', 1, 3),
    ('KIT GALETO', '350g de maionese de batata', 1, 4),
    ('KIT VAZIO', '500g de vazio', 1, 0),
    ('KIT VAZIO', '400g de arroz', 1, 1),
    ('KIT VAZIO', '350g de batata frita', 1, 2),
    ('KIT VAZIO', '350g de maionese de batata', 1, 3),
    ('KIT VAZIO', 'porção de Salada de Alface e Tomate', 1, 4),
    ('KIT MAMINHA', '500g de maminha', 1, 0),
    ('KIT MAMINHA', '400g de arroz', 1, 1),
    ('KIT MAMINHA', '350g de batata frita', 1, 2),
    ('KIT MAMINHA', '350g de maionese de batata', 1, 3),
    ('KIT MAMINHA', 'porção de Salada de Alface e Tomate', 1, 4),
    ('KIT PICANHA', '500g de picanha', 1, 0),
    ('KIT PICANHA', '400g de arroz', 1, 1),
    ('KIT PICANHA', '350g de batata frita', 1, 2),
    ('KIT PICANHA', '350g de maionese de batata', 1, 3),
    ('KIT PICANHA', 'porção de Salada de Alface e Tomate', 1, 4),
    ('KIT ENTRECOT', '500g de entrecot', 1, 0),
    ('KIT ENTRECOT', '400g de arroz', 1, 1),
    ('KIT ENTRECOT', '350g de batata frita', 1, 2),
    ('KIT ENTRECOT', '350g de maionese de batata', 1, 3),
    ('KIT ENTRECOT', 'porção de Salada de Alface e Tomate', 1, 4),
    ('KIT ALCATRA', '500g de alcatra', 1, 0),
    ('KIT ALCATRA', '400g de arroz', 1, 1),
    ('KIT ALCATRA', '350g de batata frita', 1, 2),
    ('KIT ALCATRA', '350g de maionese de batata', 1, 3),
    ('KIT ALCATRA', 'porção de Salada de Alface e Tomate', 1, 4),
    ('KIT ASSADO DE TIRAS', '500g de assado de tiras', 1, 0),
    ('KIT ASSADO DE TIRAS', '400g de arroz', 1, 1),
    ('KIT ASSADO DE TIRAS', '350g de batata frita', 1, 2),
    ('KIT ASSADO DE TIRAS', '350g de maionese de batata', 1, 3),
    ('KIT ASSADO DE TIRAS', 'porção de Salada de Alface e Tomate', 1, 4)
)
INSERT INTO "combo_items" (
  "tenant_id", "combo_product_id", "child_product_id",
  "quantity", "removable", "sort_order", "updated_at"
)
SELECT
  '019fa903-04e5-7755-8102-b176b2e0775f',
  combo_ids."id",
  component_ids."id",
  c."quantity",
  false,
  c."sort_order",
  now()
FROM composition c
JOIN _cabanhas_catalog_ids combo_ids
  ON combo_ids."key" = 'combo:' || c."combo"
JOIN _cabanhas_catalog_ids component_ids
  ON component_ids."key" = 'component:' || c."component";

WITH galeto AS (
  SELECT "id" AS product_id
  FROM _cabanhas_catalog_ids
  WHERE "key" = 'combo:KIT GALETO'
),
inserted_group AS (
  INSERT INTO "modifier_groups" (
    "tenant_id", "product_id", "name", "min", "max", "active", "updated_at"
  )
  SELECT
    '019fa903-04e5-7755-8102-b176b2e0775f',
    product_id,
    'Escolha o molho',
    1,
    1,
    true,
    now()
  FROM galeto
  RETURNING "id", "product_id"
),
inserted_link AS (
  INSERT INTO "product_modifier_groups" (
    "tenant_id", "product_id", "modifier_group_id", "sort_order", "updated_at"
  )
  SELECT
    '019fa903-04e5-7755-8102-b176b2e0775f',
    "product_id",
    "id",
    0,
    now()
  FROM inserted_group
)
INSERT INTO "modifiers" (
  "tenant_id", "group_id", "name", "price_delta_cents", "active",
  "sort_order", "updated_at"
)
SELECT
  '019fa903-04e5-7755-8102-b176b2e0775f',
  g."id",
  m."name",
  0,
  true,
  m."sort_order",
  now()
FROM inserted_group g
CROSS JOIN (VALUES
  ('Ao sugo', 0),
  ('Alho e óleo', 1),
  ('Aos quatro queijos', 2),
  ('Pesto', 3)
) AS m("name", "sort_order");

WITH portions("name", "description", "price_cents", "sort_order") AS (
  VALUES
    ('BATATA FRITA', '350g', 2000, 0),
    ('ANÉIS DE CEBOLA', '350g', 2300, 1),
    ('BATATA RÚSTICA', '350g', 2300, 2),
    ('ARROZ BRANCO', '400g', 1600, 3),
    ('AIPIM COM FAROFA', '400g', 1800, 4),
    ('MAIONESE DA CASA', '400g', 1800, 5),
    ('POLENTA DA CASA', '350g', 2300, 6),
    ('PÃO DE ALHO', 'Unidade', 350, 7),
    ('SALSICHÃO', 'Unidade', 500, 8),
    ('Salada de Alface e Tomate', NULL, 1500, 9)
),
inserted AS (
  INSERT INTO "products" (
    "tenant_id", "category_id", "name", "description", "base_price_cents",
    "available", "kind", "sort_order", "updated_at"
  )
  SELECT
    '019fa903-04e5-7755-8102-b176b2e0775f',
    ids."id",
    p."name",
    p."description",
    p."price_cents",
    true,
    'prepared'::"ProductKind",
    p."sort_order",
    now()
  FROM portions p
  CROSS JOIN _cabanhas_catalog_ids ids
  WHERE ids."key" = 'category:Porções'
  RETURNING "id", "name"
)
INSERT INTO _cabanhas_catalog_ids ("key", "id")
SELECT 'portion:' || "name", "id" FROM inserted;

WITH burgers("name", "description", "price_cents", "sort_order") AS (
  VALUES
    (
      'CABANHAS BIG STEAK',
      'Pão com gergelim, maionese Cabanhas, alface americana, hambúrguer de 200g de carne, queijo mussarela, queijo cheddar, bacon, cebola caramelizada e molho barbecue.',
      3990,
      0
    ),
    (
      'CABANHAS CLÁSSICO',
      'Pão com gergelim, maionese Cabanhas, alface americana, hambúrguer de 200g de carne, queijo mussarela, queijo cheddar, tomate, cebola roxa, picles e molho especial Cabanhas.',
      3590,
      1
    ),
    (
      'CABANHAS FRANGO GRELHADO',
      'Pão com gergelim, maionese Cabanhas, alface americana, 200g de peito de frango grelhado, queijo mussarela, queijo cheddar, tomate, cebola caramelizada e molho barbecue.',
      3490,
      2
    ),
    (
      'CABANHAS PORCO BBQ',
      'Pão com gergelim, maionese Cabanhas, porco desfiado ao molho barbecue, queijo cheddar, coleslaw (salada de repolho cremoso) e picles.',
      3990,
      3
    ),
    (
      'CABANHAS GORGON BURGER',
      'Pão com gergelim, maionese Cabanhas, alface americana, hambúrguer de 200g de carne, queijo mussarela, queijo cheddar, bacon, pasta de queijo gorgonzola e cebola caramelizada.',
      4390,
      4
    )
),
inserted AS (
  INSERT INTO "products" (
    "tenant_id", "category_id", "name", "description", "base_price_cents",
    "available", "kind", "sort_order", "updated_at"
  )
  SELECT
    '019fa903-04e5-7755-8102-b176b2e0775f',
    ids."id",
    b."name",
    b."description",
    b."price_cents",
    true,
    'prepared'::"ProductKind",
    b."sort_order",
    now()
  FROM burgers b
  CROSS JOIN _cabanhas_catalog_ids ids
  WHERE ids."key" = 'category:Hambúrgueres'
  RETURNING "id", "name"
)
INSERT INTO _cabanhas_catalog_ids ("key", "id")
SELECT 'burger:' || "name", "id" FROM inserted;

WITH first_burger AS (
  SELECT ids."id" AS product_id
  FROM _cabanhas_catalog_ids ids
  WHERE ids."key" = 'burger:CABANHAS BIG STEAK'
),
inserted_group AS (
  INSERT INTO "modifier_groups" (
    "tenant_id", "product_id", "name", "min", "max", "active", "updated_at"
  )
  SELECT
    '019fa903-04e5-7755-8102-b176b2e0775f',
    product_id,
    'Porções para acompanhar seu Burger',
    1,
    1,
    true,
    now()
  FROM first_burger
  RETURNING "id"
),
burger_links AS (
  SELECT "id" AS product_id
  FROM _cabanhas_catalog_ids
  WHERE "key" LIKE 'burger:%'
),
inserted_links AS (
  INSERT INTO "product_modifier_groups" (
    "tenant_id", "product_id", "modifier_group_id", "sort_order", "updated_at"
  )
  SELECT
    '019fa903-04e5-7755-8102-b176b2e0775f',
    burger_links.product_id,
    inserted_group."id",
    0,
    now()
  FROM burger_links
  CROSS JOIN inserted_group
)
INSERT INTO "modifiers" (
  "tenant_id", "group_id", "name", "price_delta_cents", "active",
  "sort_order", "updated_at"
)
SELECT
  '019fa903-04e5-7755-8102-b176b2e0775f',
  g."id",
  a."name",
  a."price_delta_cents",
  true,
  a."sort_order",
  now()
FROM inserted_group g
CROSS JOIN (VALUES
  ('Fritas', 1000, 0),
  ('Rústica', 1300, 1),
  ('Onion rings', 1300, 2),
  ('Maionese Cabanhas', 400, 3),
  ('Não quero acompanhamento', 0, 4)
) AS a("name", "price_delta_cents", "sort_order");

-- Confere que o catálogo ativo ficou exatamente no recorte pedido.
DO $$
DECLARE
  active_categories int;
  active_combos int;
  active_components int;
  active_combo_items int;
  active_modifier_groups int;
  active_modifiers int;
BEGIN
  SELECT count(*) INTO active_categories
  FROM "categories"
  WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
    AND "deleted_at" IS NULL;

  SELECT count(*) INTO active_combos
  FROM "products"
  WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
    AND "deleted_at" IS NULL
    AND "kind" = 'combo';

  SELECT count(*) INTO active_components
  FROM "products"
  WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
    AND "deleted_at" IS NULL
    AND "kind" <> 'combo';

  SELECT count(*) INTO active_combo_items
  FROM "combo_items"
  WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
    AND "deleted_at" IS NULL;

  SELECT count(*) INTO active_modifier_groups
  FROM "modifier_groups"
  WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
    AND "deleted_at" IS NULL;

  SELECT count(*) INTO active_modifiers
  FROM "modifiers"
  WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
    AND "deleted_at" IS NULL;

  IF active_categories <> 4 OR active_combos <> 7 OR active_components <> 29
     OR active_combo_items <> 35 OR active_modifier_groups <> 2 OR active_modifiers <> 9 THEN
    RAISE EXCEPTION
      'Catálogo Cabanhas inesperado: categorias %, combos %, componentes %, combo_items %, grupos %, modificadores %',
      active_categories, active_combos, active_components, active_combo_items,
      active_modifier_groups, active_modifiers;
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
