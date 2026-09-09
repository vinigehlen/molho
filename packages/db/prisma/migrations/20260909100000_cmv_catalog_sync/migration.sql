-- Mantem a lista de fichas do CMV sincronizada com os itens visiveis do cardapio.
-- Ficha vazia e intencional: representa um produto sem componentes cadastrados.

CREATE OR REPLACE FUNCTION cmv_ensure_product_recipe(
  p_tenant_id uuid,
  p_product_id uuid,
  p_product_name text
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_recipe_id uuid;
  v_recipe_name text := btrim(p_product_name);
  v_attempt integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || p_product_id::text, 0)
  );

  SELECT rp.recipe_id
    INTO v_recipe_id
  FROM cmv_recipe_products rp
  WHERE rp.tenant_id = p_tenant_id
    AND rp.product_id = p_product_id
    AND rp.deleted_at IS NULL
  LIMIT 1;

  IF v_recipe_id IS NOT NULL THEN
    RETURN v_recipe_id;
  END IF;

  -- Reaproveita uma ficha de produto ainda nao vinculada quando o nome bate.
  SELECT r.id
    INTO v_recipe_id
  FROM cmv_recipes r
  WHERE r.tenant_id = p_tenant_id
    AND lower(r.name) = lower(v_recipe_name)
    AND r.recipe_type = 'MENU_ITEM'
    AND r.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM cmv_recipe_products linked
      WHERE linked.tenant_id = r.tenant_id
        AND linked.recipe_id = r.id
        AND linked.deleted_at IS NULL
    )
  LIMIT 1;

  IF v_recipe_id IS NULL THEN
    LOOP
      BEGIN
        INSERT INTO cmv_recipes (tenant_id, name, recipe_type)
        VALUES (p_tenant_id, v_recipe_name, 'MENU_ITEM')
        RETURNING id INTO v_recipe_id;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          v_attempt := v_attempt + 1;
          IF v_attempt > 1 THEN
            RAISE;
          END IF;
          v_recipe_name := left(btrim(p_product_name), 130) || ' [' || p_product_id::text || ']';
      END;
    END LOOP;
  END IF;

  INSERT INTO cmv_recipe_products (tenant_id, product_id, recipe_id)
  VALUES (p_tenant_id, p_product_id, v_recipe_id)
  ON CONFLICT (tenant_id, product_id, recipe_id)
  DO UPDATE SET deleted_at = NULL;

  RETURN v_recipe_id;
END;
$$;

CREATE OR REPLACE FUNCTION cmv_sync_visible_product()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM categories c
    WHERE c.id = NEW.category_id
      AND c.tenant_id = NEW.tenant_id
      AND c.visible = true
      AND c.deleted_at IS NULL
  ) THEN
    PERFORM cmv_ensure_product_recipe(NEW.tenant_id, NEW.id, NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cmv_sync_product_after_insert ON products;
CREATE TRIGGER cmv_sync_product_after_insert
AFTER INSERT ON products
FOR EACH ROW
EXECUTE FUNCTION cmv_sync_visible_product();

CREATE OR REPLACE FUNCTION cmv_sync_products_after_category_visible()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_row record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NULL;
  ELSIF NOT (NEW.visible = true AND OLD.visible = false) THEN
    RETURN NEW;
  END IF;

  IF NEW.visible = true THEN
    FOR product_row IN
      SELECT p.id, p.tenant_id, p.name
      FROM products p
      WHERE p.category_id = NEW.id
        AND p.tenant_id = NEW.tenant_id
        AND p.deleted_at IS NULL
    LOOP
      PERFORM cmv_ensure_product_recipe(product_row.tenant_id, product_row.id, product_row.name);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cmv_sync_products_after_category_visible ON categories;
CREATE TRIGGER cmv_sync_products_after_category_visible
AFTER INSERT OR UPDATE OF visible ON categories
FOR EACH ROW
EXECUTE FUNCTION cmv_sync_products_after_category_visible();

-- Backfill idempotente para itens que ja estavam no cardapio antes desta migration.
DO $$
DECLARE
  product_row record;
BEGIN
  FOR product_row IN
    SELECT p.id, p.tenant_id, p.name
    FROM products p
    JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
    WHERE p.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND c.visible = true
  LOOP
    PERFORM cmv_ensure_product_recipe(product_row.tenant_id, product_row.id, product_row.name);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION cmv_ensure_product_recipe(uuid, uuid, text) TO app_runtime;
GRANT EXECUTE ON FUNCTION cmv_sync_visible_product() TO app_runtime;
GRANT EXECUTE ON FUNCTION cmv_sync_products_after_category_visible() TO app_runtime;
