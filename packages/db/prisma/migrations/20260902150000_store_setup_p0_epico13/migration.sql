-- Épico 13 — melhorias P0 do self-setup, expand-only.
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "legal_name" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "state_registration" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "public_description" TEXT;

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "postal_code" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "street" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "neighborhood" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "complement" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "reference_point" TEXT;

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "logo_image_key" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "cover_image_key" TEXT;

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "responsible_cpf_ciphertext" BYTEA;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "responsible_cpf_key_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "responsible_phone_ciphertext" BYTEA;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "responsible_phone_key_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "finance_email_ciphertext" BYTEA;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "finance_email_key_version" INTEGER NOT NULL DEFAULT 1;
