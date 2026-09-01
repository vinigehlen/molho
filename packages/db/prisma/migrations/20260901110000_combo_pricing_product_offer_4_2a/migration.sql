-- 4.2A: modo de preço por ProductOffer e snapshot unitário opcional dos filhos do combo.
DO $$
BEGIN
  CREATE TYPE "ComboPricingMode" AS ENUM ('fixed', 'sum_of_items');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "product_offers"
  ADD COLUMN IF NOT EXISTS "combo_pricing_mode" "ComboPricingMode" NOT NULL DEFAULT 'fixed';

ALTER TABLE "order_item_components"
  ADD COLUMN IF NOT EXISTS "unit_price_cents" INTEGER;

DO $$
BEGIN
  ALTER TABLE "order_item_components"
    ADD CONSTRAINT "order_item_components_unit_price_cents_check"
    CHECK ("unit_price_cents" IS NULL OR "unit_price_cents" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
