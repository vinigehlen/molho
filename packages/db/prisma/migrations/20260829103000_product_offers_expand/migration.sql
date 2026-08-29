-- Épico 4B — expansão compatível Product → ProductOffer.
--
-- Este passo é somente EXPANDIR: nenhuma coluna legada de products é
-- removida. O backfill preserva 100% dos valores atuais e os triggers mantêm
-- versões antigas e novas da API interoperáveis durante o rollout.
--
-- SQL idempotente porque o shadow database replaya migrations manuais mais
-- de uma vez (AGENTS.md / docs/07-aprendizados.md).

-- ─── Tabela ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "product_offers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "pdv_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "product_offers_pkey" PRIMARY KEY ("id")
);

-- Rede de segurança pra SQL cru. Nunca aceitar o falso drift
-- `ALTER COLUMN updated_at DROP DEFAULT` gerado pelo Prisma.
ALTER TABLE "product_offers" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "product_offers_tenant_id_category_id_sort_order_idx"
  ON "product_offers"("tenant_id", "category_id", "sort_order");

CREATE INDEX IF NOT EXISTS "product_offers_tenant_id_product_id_idx"
  ON "product_offers"("tenant_id", "product_id");

-- Alvo das FKs compostas futuras; id continua sendo a PK global.
CREATE UNIQUE INDEX IF NOT EXISTS "product_offers_id_tenant_id_key"
  ON "product_offers"("id", "tenant_id");

-- Um produto pode aparecer em várias categorias, mas só uma vez em cada
-- categoria enquanto o vínculo estiver vivo.
CREATE UNIQUE INDEX IF NOT EXISTS "product_offers_tenant_id_product_id_category_id_key"
  ON "product_offers"("tenant_id", "product_id", "category_id")
  WHERE "deleted_at" IS NULL;

-- Durante a convivência, exatamente uma oferta viva representa as colunas
-- legadas de Product. `is_primary` é marcador de migração, não regra de UX.
CREATE UNIQUE INDEX IF NOT EXISTS "product_offers_tenant_id_product_id_primary_key"
  ON "product_offers"("tenant_id", "product_id")
  WHERE "is_primary" = true AND "deleted_at" IS NULL;

-- ─── Foreign keys compostas (isolamento físico entre tenants) ────────────────

DO $$ BEGIN
  ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_product_id_tenant_id_fkey"
    FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_category_id_tenant_id_fkey"
    FOREIGN KEY ("category_id", "tenant_id") REFERENCES "categories"("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_price_cents_check"
    CHECK ("price_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE "product_offers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "product_offers";
CREATE POLICY tenant_isolation ON "product_offers"
  USING (app_tenant_visible("tenant_id"))
  WITH CHECK (app_tenant_visible("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "product_offers" TO app_runtime;

-- ─── Backfill sem perda ──────────────────────────────────────────────────────

-- Inclui produtos soft-deleted para preservar o estado completo. A oferta
-- recebe o mesmo deleted_at e, portanto, não reaparece nas leituras vivas.
INSERT INTO "product_offers" (
  "tenant_id",
  "product_id",
  "category_id",
  "price_cents",
  "available",
  "pdv_code",
  "sort_order",
  "is_primary",
  "version",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  p."tenant_id",
  p."id",
  p."category_id",
  p."base_price_cents",
  p."available",
  p."pdv_code",
  p."sort_order",
  true,
  p."version",
  p."created_at",
  p."updated_at",
  p."deleted_at"
FROM "products" p
WHERE NOT EXISTS (
  SELECT 1
  FROM "product_offers" po
  WHERE po."tenant_id" = p."tenant_id"
    AND po."product_id" = p."id"
    AND po."is_primary" = true
);

-- ─── Compatibilidade de versões mistas ──────────────────────────────────────

-- Produto legado → oferta primária. Cobre API antiga, importação, signup,
-- seed e qualquer outro escritor que ainda só conheça `products`.
CREATE OR REPLACE FUNCTION sync_primary_product_offer_from_product()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "product_offers" po
  SET
    "category_id" = NEW."category_id",
    "price_cents" = NEW."base_price_cents",
    "available" = NEW."available",
    "pdv_code" = NEW."pdv_code",
    "sort_order" = NEW."sort_order",
    "deleted_at" = NEW."deleted_at",
    "version" = po."version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
  WHERE po."tenant_id" = NEW."tenant_id"
    AND po."product_id" = NEW."id"
    AND po."is_primary" = true
    AND (
      po."category_id" IS DISTINCT FROM NEW."category_id"
      OR po."price_cents" IS DISTINCT FROM NEW."base_price_cents"
      OR po."available" IS DISTINCT FROM NEW."available"
      OR po."pdv_code" IS DISTINCT FROM NEW."pdv_code"
      OR po."sort_order" IS DISTINCT FROM NEW."sort_order"
      OR po."deleted_at" IS DISTINCT FROM NEW."deleted_at"
    );

  IF NOT EXISTS (
    SELECT 1 FROM "product_offers" po
    WHERE po."tenant_id" = NEW."tenant_id"
      AND po."product_id" = NEW."id"
      AND po."is_primary" = true
  ) THEN
    INSERT INTO "product_offers" (
      "tenant_id", "product_id", "category_id", "price_cents", "available",
      "pdv_code", "sort_order", "is_primary", "version", "created_at",
      "updated_at", "deleted_at"
    ) VALUES (
      NEW."tenant_id", NEW."id", NEW."category_id", NEW."base_price_cents", NEW."available",
      NEW."pdv_code", NEW."sort_order", true, NEW."version", NEW."created_at",
      NEW."updated_at", NEW."deleted_at"
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Oferta primária → produto legado. Cobre a API nova sem deixar storefront,
-- checkout, pedidos ou uma instância antiga da API enxergarem valor velho.
CREATE OR REPLACE FUNCTION sync_product_from_primary_product_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."is_primary" = true THEN
    UPDATE "products" p
    SET
      "category_id" = NEW."category_id",
      "base_price_cents" = NEW."price_cents",
      "available" = NEW."available",
      "pdv_code" = NEW."pdv_code",
      "sort_order" = NEW."sort_order",
      "deleted_at" = NEW."deleted_at",
      "version" = p."version" + 1,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE p."tenant_id" = NEW."tenant_id"
      AND p."id" = NEW."product_id"
      AND (
        p."category_id" IS DISTINCT FROM NEW."category_id"
        OR p."base_price_cents" IS DISTINCT FROM NEW."price_cents"
        OR p."available" IS DISTINCT FROM NEW."available"
        OR p."pdv_code" IS DISTINCT FROM NEW."pdv_code"
        OR p."sort_order" IS DISTINCT FROM NEW."sort_order"
        OR p."deleted_at" IS DISTINCT FROM NEW."deleted_at"
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_primary_product_offer_from_product_trigger ON "products";
CREATE TRIGGER sync_primary_product_offer_from_product_trigger
AFTER INSERT OR UPDATE ON "products"
FOR EACH ROW
EXECUTE FUNCTION sync_primary_product_offer_from_product();

DROP TRIGGER IF EXISTS sync_product_from_primary_product_offer_trigger ON "product_offers";
CREATE TRIGGER sync_product_from_primary_product_offer_trigger
AFTER INSERT OR UPDATE ON "product_offers"
FOR EACH ROW
EXECUTE FUNCTION sync_product_from_primary_product_offer();
