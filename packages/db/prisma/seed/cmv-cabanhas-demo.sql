-- Seed demo do CMV da Cabanhas BBQ.
--
-- Dados fictícios de teste, conforme especificação anexada. Rodar só quando
-- quiser popular a demonstração:
--
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f packages/db/prisma/seed/cmv-cabanhas-demo.sql
--
-- Nunca é chamado pelo db:seed padrão.

BEGIN;

SET LOCAL app.tenant_id = '019fa903-04e5-7755-8102-b176b2e0775f';

CREATE TEMP TABLE _cmv_ingredients (
  name text PRIMARY KEY,
  category "CmvIngredientCategory" NOT NULL,
  unit "CmvUnit" NOT NULL,
  cost_cents int NOT NULL,
  estimated boolean NOT NULL DEFAULT false
) ON COMMIT DROP;

INSERT INTO _cmv_ingredients(name, category, unit, cost_cents, estimated) VALUES
  ('Coxa/sobrecoxa', 'aves', 'kg', 1400, false),
  ('Vazio', 'carnes', 'kg', 4200, false),
  ('Maminha', 'carnes', 'kg', 4400, false),
  ('Picanha', 'carnes', 'kg', 7200, false),
  ('Entrecô', 'carnes', 'kg', 6500, false),
  ('Alcatra', 'carnes', 'kg', 4200, false),
  ('Assado de tiras', 'carnes', 'kg', 5800, false),
  ('Blend bovino burger', 'carnes', 'kg', 3800, false),
  ('Peito de frango', 'aves', 'kg', 2200, false),
  ('Porco desfiado BBQ', 'carnes', 'kg', 3444, true),
  ('Pão burger', 'secos', 'un', 150, false),
  ('Mussarela', 'laticinios', 'kg', 3400, false),
  ('Cheddar', 'laticinios', 'kg', 2800, false),
  ('Bacon', 'carnes', 'kg', 4200, false),
  ('Maionese Cabanhas', 'molhos', 'kg', 1500, false),
  ('Alface americana', 'hortifruti', 'kg', 800, false),
  ('Tomate', 'hortifruti', 'kg', 600, false),
  ('Cebola roxa', 'hortifruti', 'kg', 500, false),
  ('Picles', 'hortifruti', 'kg', 2000, false),
  ('Cebola caramelizada', 'hortifruti', 'kg', 1375, false),
  ('Molho barbecue', 'molhos', 'kg', 1520, false),
  ('Molho especial', 'molhos', 'kg', 2000, false),
  ('Pasta de gorgonzola', 'laticinios', 'kg', 5500, false),
  ('Coleslaw', 'hortifruti', 'kg', 1500, false),
  ('Embalagem burger', 'embalagens', 'un', 120, false),
  ('Embalagem kit', 'embalagens', 'un', 350, false),
  ('Embalagem porção', 'embalagens', 'un', 100, false),
  ('Embalagem pequena', 'embalagens', 'un', 15, false),
  ('Embalagem salada', 'embalagens', 'un', 80, false),
  ('Arroz branco 400g', 'secos', 'porcao', 120, true),
  ('Batata frita 350g produção', 'secos', 'porcao', 455, true),
  ('Maionese da casa 350g', 'molhos', 'porcao', 368, true),
  ('Maionese da casa 400g', 'molhos', 'porcao', 420, true),
  ('Salada de alface e tomate', 'hortifruti', 'porcao', 320, true),
  ('Polenta 350g produção', 'secos', 'porcao', 310, true),
  ('Massa 350g', 'secos', 'porcao', 140, true),
  ('Molho médio Kit Galeto', 'molhos', 'porcao', 180, true),
  ('Ao sugo', 'molhos', 'porcao', 120, true),
  ('Alho e óleo', 'molhos', 'porcao', 100, true),
  ('Quatro queijos', 'molhos', 'porcao', 280, true),
  ('Pesto', 'molhos', 'porcao', 220, true),
  ('Anéis de cebola 350g produção', 'secos', 'porcao', 630, true),
  ('Batata rústica 350g produção', 'secos', 'porcao', 480, true),
  ('Aipim com farofa 400g produção', 'secos', 'porcao', 390, true),
  ('Pão de alho', 'secos', 'un', 120, true),
  ('Salsichão', 'carnes', 'un', 250, true)
ON CONFLICT (name) DO NOTHING;

UPDATE "cmv_ingredients" i
SET "category" = src.category,
    "base_unit" = src.unit,
    "purchase_unit" = src.unit,
    "purchase_quantity" = 1,
    "current_purchase_cost_cents" = src.cost_cents,
    "yield_percentage" = 100,
    "active" = true,
    "deleted_at" = NULL,
    "updated_at" = now()
FROM _cmv_ingredients src
WHERE i."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND lower(i."name") = lower(src.name);

INSERT INTO "cmv_ingredients" (
  "tenant_id", "name", "category", "base_unit", "purchase_unit",
  "purchase_quantity", "current_purchase_cost_cents", "yield_percentage",
  "active", "updated_at"
)
SELECT
  '019fa903-04e5-7755-8102-b176b2e0775f',
  src.name,
  src.category,
  src.unit,
  src.unit,
  1,
  src.cost_cents,
  100,
  true,
  now()
FROM _cmv_ingredients src
WHERE NOT EXISTS (
  SELECT 1 FROM "cmv_ingredients" i
  WHERE i."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
    AND lower(i."name") = lower(src.name)
    AND i."deleted_at" IS NULL
);

INSERT INTO "cmv_ingredient_cost_history" (
  "tenant_id", "ingredient_id", "purchase_cost_cents", "net_unit_cost_cents",
  "valid_from", "source", "is_test_data"
)
SELECT
  i."tenant_id",
  i."id",
  src.cost_cents,
  src.cost_cents,
  '2026-09-01T00:00:00-03:00'::timestamptz,
  'seed_cmv_cabanhas_demo',
  true
FROM _cmv_ingredients src
JOIN "cmv_ingredients" i
  ON i."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
 AND lower(i."name") = lower(src.name)
WHERE NOT EXISTS (
  SELECT 1 FROM "cmv_ingredient_cost_history" h
  WHERE h."tenant_id" = i."tenant_id"
    AND h."ingredient_id" = i."id"
    AND h."valid_from" = '2026-09-01T00:00:00-03:00'::timestamptz
    AND h."source" = 'seed_cmv_cabanhas_demo'
);

CREATE TEMP TABLE _cmv_recipes (
  product_name text PRIMARY KEY,
  recipe_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO _cmv_recipes(product_name, recipe_name) VALUES
  ('KIT GALETO', 'KIT GALETO'),
  ('KIT VAZIO', 'KIT VAZIO'),
  ('KIT MAMINHA', 'KIT MAMINHA'),
  ('KIT PICANHA', 'KIT PICANHA'),
  ('KIT ENTRECOT', 'KIT ENTRECÔ'),
  ('KIT ALCATRA', 'KIT ALCATRA'),
  ('KIT ASSADO DE TIRAS', 'KIT ASSADO DE TIRAS'),
  ('BATATA FRITA', 'Batata Frita 350g'),
  ('ANÉIS DE CEBOLA', 'Anéis de Cebola 350g'),
  ('BATATA RÚSTICA', 'Batata Rústica 350g'),
  ('ARROZ BRANCO', 'Arroz Branco 400g'),
  ('AIPIM COM FAROFA', 'Aipim com Farofa 400g'),
  ('MAIONESE DA CASA', 'Maionese da Casa 400g'),
  ('POLENTA DA CASA', 'Polenta da Casa 350g'),
  ('PÃO DE ALHO', 'Pão de Alho'),
  ('SALSICHÃO', 'Salsichão'),
  ('Salada de Alface e Tomate', 'Salada'),
  ('CABANHAS BIG STEAK', 'CABANHAS BIG STEAK'),
  ('CABANHAS CLÁSSICO', 'CABANHAS CLÁSSICO'),
  ('CABANHAS FRANGO GRELHADO', 'CABANHAS FRANGO GRELHADO'),
  ('CABANHAS PORCO BBQ', 'CABANHAS PORCO BBQ'),
  ('CABANHAS GORGON BURGER', 'CABANHAS GORGON BURGER')
ON CONFLICT (product_name) DO NOTHING;

UPDATE "cmv_recipes" r
SET "recipe_type" = 'MENU_ITEM',
    "yield_quantity" = 1,
    "yield_unit" = 'un',
    "active" = true,
    "is_test_data" = true,
    "deleted_at" = NULL,
    "updated_at" = now()
FROM _cmv_recipes src
WHERE r."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND lower(r."name") = lower(src.recipe_name);

INSERT INTO "cmv_recipes" (
  "tenant_id", "name", "recipe_type", "yield_quantity", "yield_unit",
  "active", "is_test_data", "updated_at"
)
SELECT
  '019fa903-04e5-7755-8102-b176b2e0775f',
  recipe_name,
  'MENU_ITEM',
  1,
  'un',
  true,
  true,
  now()
FROM _cmv_recipes src
WHERE NOT EXISTS (
  SELECT 1 FROM "cmv_recipes" r
  WHERE r."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
    AND lower(r."name") = lower(src.recipe_name)
    AND r."deleted_at" IS NULL
);

UPDATE "cmv_recipe_products"
SET "deleted_at" = now()
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "deleted_at" IS NULL
  AND "recipe_id" IN (
    SELECT r."id"
    FROM "cmv_recipes" r
    JOIN _cmv_recipes src ON lower(src.recipe_name) = lower(r."name")
    WHERE r."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  );

INSERT INTO "cmv_recipe_products" ("tenant_id", "product_id", "recipe_id")
SELECT p."tenant_id", p."id", r."id"
FROM _cmv_recipes src
JOIN "products" p
  ON p."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
 AND p."deleted_at" IS NULL
 AND lower(p."name") = lower(src.product_name)
JOIN "cmv_recipes" r
  ON r."tenant_id" = p."tenant_id"
 AND r."deleted_at" IS NULL
 AND lower(r."name") = lower(src.recipe_name)
ON CONFLICT ("tenant_id", "product_id", "recipe_id") DO UPDATE SET "deleted_at" = NULL;

UPDATE "cmv_recipe_components"
SET "deleted_at" = now(),
    "updated_at" = now()
WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND "recipe_id" IN (
    SELECT r."id"
    FROM "cmv_recipes" r
    JOIN _cmv_recipes src ON lower(src.recipe_name) = lower(r."name")
    WHERE r."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  )
  AND "deleted_at" IS NULL;

CREATE TEMP TABLE _cmv_components (
  recipe_name text NOT NULL,
  ingredient_name text NOT NULL,
  qty numeric(12,3) NOT NULL,
  unit "CmvUnit" NOT NULL,
  sort_order int NOT NULL,
  estimated boolean NOT NULL DEFAULT false
) ON COMMIT DROP;

INSERT INTO _cmv_components(recipe_name, ingredient_name, qty, unit, sort_order, estimated) VALUES
  ('KIT GALETO', 'Coxa/sobrecoxa', 0.750, 'kg', 0, false),
  ('KIT GALETO', 'Massa 350g', 1, 'porcao', 1, true),
  ('KIT GALETO', 'Molho médio Kit Galeto', 1, 'porcao', 2, true),
  ('KIT GALETO', 'Polenta 350g produção', 1, 'porcao', 3, true),
  ('KIT GALETO', 'Maionese da casa 350g', 1, 'porcao', 4, true),
  ('KIT GALETO', 'Embalagem kit', 1, 'un', 5, false),
  ('KIT VAZIO', 'Vazio', 0.500, 'kg', 0, false),
  ('KIT MAMINHA', 'Maminha', 0.500, 'kg', 0, false),
  ('KIT PICANHA', 'Picanha', 0.500, 'kg', 0, false),
  ('KIT ENTRECÔ', 'Entrecô', 0.500, 'kg', 0, false),
  ('KIT ALCATRA', 'Alcatra', 0.500, 'kg', 0, false),
  ('KIT ASSADO DE TIRAS', 'Assado de tiras', 0.500, 'kg', 0, false),
  ('KIT VAZIO', 'Arroz branco 400g', 1, 'porcao', 1, true),
  ('KIT MAMINHA', 'Arroz branco 400g', 1, 'porcao', 1, true),
  ('KIT PICANHA', 'Arroz branco 400g', 1, 'porcao', 1, true),
  ('KIT ENTRECÔ', 'Arroz branco 400g', 1, 'porcao', 1, true),
  ('KIT ALCATRA', 'Arroz branco 400g', 1, 'porcao', 1, true),
  ('KIT ASSADO DE TIRAS', 'Arroz branco 400g', 1, 'porcao', 1, true),
  ('KIT VAZIO', 'Batata frita 350g produção', 1, 'porcao', 2, true),
  ('KIT MAMINHA', 'Batata frita 350g produção', 1, 'porcao', 2, true),
  ('KIT PICANHA', 'Batata frita 350g produção', 1, 'porcao', 2, true),
  ('KIT ENTRECÔ', 'Batata frita 350g produção', 1, 'porcao', 2, true),
  ('KIT ALCATRA', 'Batata frita 350g produção', 1, 'porcao', 2, true),
  ('KIT ASSADO DE TIRAS', 'Batata frita 350g produção', 1, 'porcao', 2, true),
  ('KIT VAZIO', 'Maionese da casa 350g', 1, 'porcao', 3, true),
  ('KIT MAMINHA', 'Maionese da casa 350g', 1, 'porcao', 3, true),
  ('KIT PICANHA', 'Maionese da casa 350g', 1, 'porcao', 3, true),
  ('KIT ENTRECÔ', 'Maionese da casa 350g', 1, 'porcao', 3, true),
  ('KIT ALCATRA', 'Maionese da casa 350g', 1, 'porcao', 3, true),
  ('KIT ASSADO DE TIRAS', 'Maionese da casa 350g', 1, 'porcao', 3, true),
  ('KIT VAZIO', 'Salada de alface e tomate', 1, 'porcao', 4, true),
  ('KIT MAMINHA', 'Salada de alface e tomate', 1, 'porcao', 4, true),
  ('KIT PICANHA', 'Salada de alface e tomate', 1, 'porcao', 4, true),
  ('KIT ENTRECÔ', 'Salada de alface e tomate', 1, 'porcao', 4, true),
  ('KIT ALCATRA', 'Salada de alface e tomate', 1, 'porcao', 4, true),
  ('KIT ASSADO DE TIRAS', 'Salada de alface e tomate', 1, 'porcao', 4, true),
  ('KIT VAZIO', 'Embalagem kit', 1, 'un', 5, false),
  ('KIT MAMINHA', 'Embalagem kit', 1, 'un', 5, false),
  ('KIT PICANHA', 'Embalagem kit', 1, 'un', 5, false),
  ('KIT ENTRECÔ', 'Embalagem kit', 1, 'un', 5, false),
  ('KIT ALCATRA', 'Embalagem kit', 1, 'un', 5, false),
  ('KIT ASSADO DE TIRAS', 'Embalagem kit', 1, 'un', 5, false),
  ('Batata Frita 350g', 'Batata frita 350g produção', 1, 'porcao', 0, true),
  ('Batata Frita 350g', 'Embalagem porção', 1, 'un', 1, false),
  ('Anéis de Cebola 350g', 'Anéis de cebola 350g produção', 1, 'porcao', 0, true),
  ('Anéis de Cebola 350g', 'Embalagem porção', 1, 'un', 1, false),
  ('Batata Rústica 350g', 'Batata rústica 350g produção', 1, 'porcao', 0, true),
  ('Batata Rústica 350g', 'Embalagem porção', 1, 'un', 1, false),
  ('Arroz Branco 400g', 'Arroz branco 400g', 1, 'porcao', 0, true),
  ('Arroz Branco 400g', 'Embalagem porção', 1, 'un', 1, false),
  ('Aipim com Farofa 400g', 'Aipim com farofa 400g produção', 1, 'porcao', 0, true),
  ('Aipim com Farofa 400g', 'Embalagem porção', 1, 'un', 1, false),
  ('Maionese da Casa 400g', 'Maionese da casa 400g', 1, 'porcao', 0, true),
  ('Maionese da Casa 400g', 'Embalagem porção', 1, 'un', 1, false),
  ('Polenta da Casa 350g', 'Polenta 350g produção', 1, 'porcao', 0, true),
  ('Polenta da Casa 350g', 'Embalagem porção', 1, 'un', 1, false),
  ('Pão de Alho', 'Pão de alho', 1, 'un', 0, true),
  ('Pão de Alho', 'Embalagem pequena', 1, 'un', 1, false),
  ('Salsichão', 'Salsichão', 1, 'un', 0, true),
  ('Salsichão', 'Embalagem pequena', 1, 'un', 1, false),
  ('Salada', 'Salada de alface e tomate', 1, 'porcao', 0, true),
  ('Salada', 'Embalagem salada', 1, 'un', 1, false),
  ('CABANHAS BIG STEAK', 'Pão burger', 1, 'un', 0, false),
  ('CABANHAS BIG STEAK', 'Maionese Cabanhas', 0.030, 'kg', 1, false),
  ('CABANHAS BIG STEAK', 'Alface americana', 0.025, 'kg', 2, false),
  ('CABANHAS BIG STEAK', 'Blend bovino burger', 0.200, 'kg', 3, false),
  ('CABANHAS BIG STEAK', 'Mussarela', 0.040, 'kg', 4, false),
  ('CABANHAS BIG STEAK', 'Cheddar', 0.030, 'kg', 5, false),
  ('CABANHAS BIG STEAK', 'Bacon', 0.035, 'kg', 6, false),
  ('CABANHAS BIG STEAK', 'Cebola caramelizada', 0.040, 'kg', 7, false),
  ('CABANHAS BIG STEAK', 'Molho barbecue', 0.025, 'kg', 8, false),
  ('CABANHAS BIG STEAK', 'Embalagem burger', 1, 'un', 9, false),
  ('CABANHAS CLÁSSICO', 'Pão burger', 1, 'un', 0, false),
  ('CABANHAS CLÁSSICO', 'Maionese Cabanhas', 0.030, 'kg', 1, false),
  ('CABANHAS CLÁSSICO', 'Alface americana', 0.025, 'kg', 2, false),
  ('CABANHAS CLÁSSICO', 'Blend bovino burger', 0.200, 'kg', 3, false),
  ('CABANHAS CLÁSSICO', 'Mussarela', 0.040, 'kg', 4, false),
  ('CABANHAS CLÁSSICO', 'Cheddar', 0.030, 'kg', 5, false),
  ('CABANHAS CLÁSSICO', 'Tomate', 0.040, 'kg', 6, false),
  ('CABANHAS CLÁSSICO', 'Cebola roxa', 0.020, 'kg', 7, false),
  ('CABANHAS CLÁSSICO', 'Picles', 0.020, 'kg', 8, false),
  ('CABANHAS CLÁSSICO', 'Molho especial', 0.025, 'kg', 9, false),
  ('CABANHAS CLÁSSICO', 'Embalagem burger', 1, 'un', 10, false),
  ('CABANHAS FRANGO GRELHADO', 'Pão burger', 1, 'un', 0, false),
  ('CABANHAS FRANGO GRELHADO', 'Maionese Cabanhas', 0.030, 'kg', 1, false),
  ('CABANHAS FRANGO GRELHADO', 'Alface americana', 0.025, 'kg', 2, false),
  ('CABANHAS FRANGO GRELHADO', 'Peito de frango', 0.200, 'kg', 3, false),
  ('CABANHAS FRANGO GRELHADO', 'Mussarela', 0.040, 'kg', 4, false),
  ('CABANHAS FRANGO GRELHADO', 'Cheddar', 0.030, 'kg', 5, false),
  ('CABANHAS FRANGO GRELHADO', 'Tomate', 0.040, 'kg', 6, false),
  ('CABANHAS FRANGO GRELHADO', 'Cebola caramelizada', 0.040, 'kg', 7, false),
  ('CABANHAS FRANGO GRELHADO', 'Molho barbecue', 0.025, 'kg', 8, false),
  ('CABANHAS FRANGO GRELHADO', 'Embalagem burger', 1, 'un', 9, false),
  ('CABANHAS PORCO BBQ', 'Pão burger', 1, 'un', 0, false),
  ('CABANHAS PORCO BBQ', 'Maionese Cabanhas', 0.030, 'kg', 1, false),
  ('CABANHAS PORCO BBQ', 'Porco desfiado BBQ', 0.180, 'kg', 2, true),
  ('CABANHAS PORCO BBQ', 'Cheddar', 0.030, 'kg', 3, false),
  ('CABANHAS PORCO BBQ', 'Coleslaw', 0.080, 'kg', 4, false),
  ('CABANHAS PORCO BBQ', 'Picles', 0.020, 'kg', 5, false),
  ('CABANHAS PORCO BBQ', 'Embalagem burger', 1, 'un', 6, false),
  ('CABANHAS GORGON BURGER', 'Pão burger', 1, 'un', 0, false),
  ('CABANHAS GORGON BURGER', 'Maionese Cabanhas', 0.030, 'kg', 1, false),
  ('CABANHAS GORGON BURGER', 'Alface americana', 0.025, 'kg', 2, false),
  ('CABANHAS GORGON BURGER', 'Blend bovino burger', 0.200, 'kg', 3, false),
  ('CABANHAS GORGON BURGER', 'Mussarela', 0.040, 'kg', 4, false),
  ('CABANHAS GORGON BURGER', 'Cheddar', 0.030, 'kg', 5, false),
  ('CABANHAS GORGON BURGER', 'Bacon', 0.035, 'kg', 6, false),
  ('CABANHAS GORGON BURGER', 'Pasta de gorgonzola', 0.040, 'kg', 7, false),
  ('CABANHAS GORGON BURGER', 'Cebola caramelizada', 0.040, 'kg', 8, false),
  ('CABANHAS GORGON BURGER', 'Embalagem burger', 1, 'un', 9, false);

INSERT INTO "cmv_recipe_components" (
  "tenant_id", "recipe_id", "component_type", "ingredient_id", "quantity",
  "unit", "loss_percentage", "is_estimated", "sort_order", "updated_at"
)
SELECT
  r."tenant_id",
  r."id",
  'ingredient',
  i."id",
  c.qty,
  c.unit,
  0,
  c.estimated,
  c.sort_order,
  now()
FROM _cmv_components c
JOIN "cmv_recipes" r
  ON r."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
 AND r."deleted_at" IS NULL
 AND lower(r."name") = lower(c.recipe_name)
JOIN "cmv_ingredients" i
  ON i."tenant_id" = r."tenant_id"
 AND i."deleted_at" IS NULL
 AND lower(i."name") = lower(c.ingredient_name);

-- Liga o módulo para a Cabanhas caso o seed rode em banco existente.
INSERT INTO "tenant_entitlements" ("tenant_id", "module_key", "source", "status", "updated_at")
VALUES ('019fa903-04e5-7755-8102-b176b2e0775f', 'analytics.cmv', 'manual', 'active', now())
ON CONFLICT ("tenant_id", "module_key") DO UPDATE SET "status" = 'active', "deleted_at" = NULL, "updated_at" = now();

INSERT INTO "tenant_settings" ("tenant_id", "module_key", "enabled", "updated_at")
VALUES ('019fa903-04e5-7755-8102-b176b2e0775f', 'analytics.cmv', true, now())
ON CONFLICT ("tenant_id", "module_key") DO UPDATE SET "enabled" = true, "deleted_at" = NULL, "updated_at" = now();

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM "cmv_recipe_products"
  WHERE "tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f' AND "deleted_at" IS NULL;
  IF n <> 22 THEN
    RAISE EXCEPTION 'Esperava 22 fichas CMV vinculadas a produtos ativos, achei %', n;
  END IF;
END $$;

SELECT r."name" AS ficha,
       sum(round(h."net_unit_cost_cents" * rc."quantity" * (1 + rc."loss_percentage" / 100.0)))::int AS cmv_cents
FROM "cmv_recipes" r
JOIN "cmv_recipe_components" rc ON rc."recipe_id" = r."id" AND rc."tenant_id" = r."tenant_id" AND rc."deleted_at" IS NULL
JOIN "cmv_ingredients" i ON i."id" = rc."ingredient_id" AND i."tenant_id" = rc."tenant_id"
JOIN LATERAL (
  SELECT "net_unit_cost_cents"
  FROM "cmv_ingredient_cost_history" h
  WHERE h."ingredient_id" = i."id"
    AND h."tenant_id" = i."tenant_id"
    AND h."valid_from" <= now()
  ORDER BY h."valid_from" DESC
  LIMIT 1
) h ON true
WHERE r."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND r."deleted_at" IS NULL
GROUP BY r."name"
ORDER BY r."name";

COMMIT;
