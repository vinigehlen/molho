-- Aceite legal auditável no checkout.
-- Nullable por compatibilidade: pedidos antigos nasceram antes desta exigência.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "legal_terms_version" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "legal_privacy_version" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "legal_accepted_at" TIMESTAMP(3);

