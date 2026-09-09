-- Módulo CMV — insumos, histórico de custos e fichas técnicas.
--
-- Idempotente porque parte das migrations deste repo tem SQL manual e o
-- shadow database reexecuta tudo. Custos históricos nunca são sobrescritos
-- retroativamente: relatórios buscam o custo vigente em orders.created_at.

DO $$ BEGIN
  CREATE TYPE "CmvIngredientCategory" AS ENUM (
    'carnes', 'aves', 'hortifruti', 'secos', 'laticinios', 'molhos',
    'bebidas', 'embalagens', 'outros'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CmvUnit" AS ENUM ('g', 'kg', 'ml', 'l', 'un', 'porcao');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CmvRecipeType" AS ENUM ('MENU_ITEM', 'SUB_RECIPE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CmvComponentType" AS ENUM ('ingredient', 'recipe');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "cmv_ingredients" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "category" "CmvIngredientCategory" NOT NULL DEFAULT 'outros',
  "base_unit" "CmvUnit" NOT NULL,
  "purchase_unit" "CmvUnit" NOT NULL,
  "purchase_quantity" NUMERIC(12,3) NOT NULL DEFAULT 1,
  "current_purchase_cost_cents" INTEGER NOT NULL,
  "yield_percentage" NUMERIC(6,3) NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "cmv_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cmv_ingredient_cost_history" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID NOT NULL,
  "ingredient_id" UUID NOT NULL,
  "purchase_cost_cents" INTEGER NOT NULL,
  "net_unit_cost_cents" INTEGER NOT NULL,
  "valid_from" TIMESTAMP(3) NOT NULL,
  "supplier_name" TEXT,
  "source" TEXT NOT NULL,
  "is_test_data" BOOLEAN NOT NULL DEFAULT false,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cmv_ingredient_cost_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cmv_recipes" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "recipe_type" "CmvRecipeType" NOT NULL,
  "yield_quantity" NUMERIC(12,3) NOT NULL DEFAULT 1,
  "yield_unit" "CmvUnit" NOT NULL DEFAULT 'un',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "is_test_data" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "cmv_recipes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cmv_recipe_products" (
  "tenant_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "recipe_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "cmv_recipe_products_pkey" PRIMARY KEY ("tenant_id", "product_id", "recipe_id")
);

CREATE TABLE IF NOT EXISTS "cmv_recipe_components" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID NOT NULL,
  "recipe_id" UUID NOT NULL,
  "component_type" "CmvComponentType" NOT NULL,
  "ingredient_id" UUID,
  "child_recipe_id" UUID,
  "quantity" NUMERIC(12,3) NOT NULL,
  "unit" "CmvUnit" NOT NULL,
  "loss_percentage" NUMERIC(6,3) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "is_estimated" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "cmv_recipe_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cmv_ingredients_id_tenant_id_key" ON "cmv_ingredients"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cmv_recipes_id_tenant_id_key" ON "cmv_recipes"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cmv_ingredients_tenant_name_key" ON "cmv_ingredients"("tenant_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "cmv_recipes_tenant_name_key" ON "cmv_recipes"("tenant_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "cmv_recipe_products_one_active_recipe" ON "cmv_recipe_products"("tenant_id", "product_id") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "cmv_cost_history_tenant_ingredient_valid_idx" ON "cmv_ingredient_cost_history"("tenant_id", "ingredient_id", "valid_from" DESC);
CREATE INDEX IF NOT EXISTS "cmv_recipe_components_tenant_recipe_idx" ON "cmv_recipe_components"("tenant_id", "recipe_id", "sort_order");

DO $$ BEGIN
  ALTER TABLE "cmv_ingredients" ADD CONSTRAINT "cmv_ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_ingredient_cost_history" ADD CONSTRAINT "cmv_cost_history_ingredient_tenant_fkey" FOREIGN KEY ("ingredient_id", "tenant_id") REFERENCES "cmv_ingredients"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_ingredient_cost_history" ADD CONSTRAINT "cmv_cost_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_recipes" ADD CONSTRAINT "cmv_recipes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_recipe_products" ADD CONSTRAINT "cmv_recipe_products_product_tenant_fkey" FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_recipe_products" ADD CONSTRAINT "cmv_recipe_products_recipe_tenant_fkey" FOREIGN KEY ("recipe_id", "tenant_id") REFERENCES "cmv_recipes"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_recipe_components" ADD CONSTRAINT "cmv_recipe_components_recipe_tenant_fkey" FOREIGN KEY ("recipe_id", "tenant_id") REFERENCES "cmv_recipes"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_recipe_components" ADD CONSTRAINT "cmv_recipe_components_ingredient_tenant_fkey" FOREIGN KEY ("ingredient_id", "tenant_id") REFERENCES "cmv_ingredients"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_recipe_components" ADD CONSTRAINT "cmv_recipe_components_child_recipe_tenant_fkey" FOREIGN KEY ("child_recipe_id", "tenant_id") REFERENCES "cmv_recipes"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_ingredients" ADD CONSTRAINT "cmv_ingredients_money_check" CHECK (
    "current_purchase_cost_cents" >= 0 AND "purchase_quantity" > 0 AND "yield_percentage" > 0 AND "yield_percentage" <= 100
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_ingredient_cost_history" ADD CONSTRAINT "cmv_cost_history_money_check" CHECK (
    "purchase_cost_cents" >= 0 AND "net_unit_cost_cents" >= 0
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_recipes" ADD CONSTRAINT "cmv_recipes_yield_check" CHECK ("yield_quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_recipe_components" ADD CONSTRAINT "cmv_recipe_components_quantity_check" CHECK (
    "quantity" > 0 AND "loss_percentage" >= 0 AND "loss_percentage" < 100
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cmv_recipe_components" ADD CONSTRAINT "cmv_recipe_components_component_xor_check" CHECK (
       ("component_type" = 'ingredient' AND "ingredient_id" IS NOT NULL AND "child_recipe_id" IS NULL)
    OR ("component_type" = 'recipe' AND "ingredient_id" IS NULL AND "child_recipe_id" IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "cmv_ingredients" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cmv_ingredients";
CREATE POLICY tenant_isolation ON "cmv_ingredients"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "cmv_ingredient_cost_history" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cmv_ingredient_cost_history";
CREATE POLICY tenant_isolation ON "cmv_ingredient_cost_history"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "cmv_recipes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cmv_recipes";
CREATE POLICY tenant_isolation ON "cmv_recipes"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "cmv_recipe_products" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cmv_recipe_products";
CREATE POLICY tenant_isolation ON "cmv_recipe_products"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

ALTER TABLE "cmv_recipe_components" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cmv_recipe_components";
CREATE POLICY tenant_isolation ON "cmv_recipe_components"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "cmv_ingredients" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "cmv_ingredient_cost_history" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "cmv_recipes" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "cmv_recipe_products" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "cmv_recipe_components" TO app_runtime;
