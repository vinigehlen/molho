-- Interruptor de CHECKOUT SEM OTP (`checkout.guest`) — tenant da Cabanhas.
--
-- Enquanto o super-admin não existe (Épico 14), ligar/desligar é ESTE arquivo.
-- Ver CLAUDE.md regra 13 (EMENDA) pro que o interruptor faz e o que ele não
-- afrouxa, e docs/08 § "Interruptor de CHECKOUT SEM OTP" pro desenho.
--
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f packages/db/prisma/seed/checkout-guest.sql
--
-- ⚠ LIGAR é o default do arquivo. Pra DESLIGAR, troque o `true` do UPDATE
--   final por `false` (está marcado). É o mesmo comando: uma linha só decide.
--
-- ⚠ O efeito leva ATÉ 60 SEGUNDOS pra valer: `ModuleService` cacheia a
--   resposta no Redis com TTL de 60s (module-service.ts). Não é bug, e não
--   adianta rodar de novo — é só esperar. A invalidação automática
--   (`withModuleInvalidation`) só dispara em escrita pelo Prisma Client; SQL à
--   mão passa por fora dela, de propósito.
--
-- Idempotente: rodar duas vezes não duplica nada.

BEGIN;

SET LOCAL app.tenant_id = '019fa903-04e5-7755-8102-b176b2e0775f';

-- ─── 1. Direito (entitlement) ────────────────────────────────────────────────
--
-- `isModuleActive` exige as TRÊS camadas: entitled AND enabled AND released
-- (docs/01 §5-B.1). `checkout.guest` está em todos os planos, mas nasce SEM
-- linha aqui porque `default: false` — quem provisiona não liga isso sozinho.
--
-- `source = 'manual'`: não veio de plano nem de add-on, veio de uma decisão
-- operacional nominal. É o que o Épico 14 vai mostrar no painel.
INSERT INTO "tenant_entitlements" ("tenant_id", "module_key", "source", "status", "updated_at")
VALUES ('019fa903-04e5-7755-8102-b176b2e0775f', 'checkout.guest', 'manual', 'active', now())
ON CONFLICT ("tenant_id", "module_key")
DO UPDATE SET "status" = 'active', "deleted_at" = NULL, "updated_at" = now();

-- ─── 2. O INTERRUPTOR (setting) ──────────────────────────────────────────────
--
-- 👉 ESTA É A LINHA QUE VOCÊ MEXE: `true` liga o checkout sem OTP, `false`
--    volta a exigir OTP. O direito acima FICA — desligar não é revogar.
INSERT INTO "tenant_settings" ("tenant_id", "module_key", "enabled", "updated_at")
VALUES ('019fa903-04e5-7755-8102-b176b2e0775f', 'checkout.guest', true, now())  -- ← true = LIGADO / false = DESLIGADO
ON CONFLICT ("tenant_id", "module_key")
DO UPDATE SET
  "enabled"    = EXCLUDED."enabled",
  "deleted_at" = NULL,
  "version"    = "tenant_settings"."version" + 1,
  "updated_at" = now();

-- ─── 3. Conferência (sai no output do psql) ──────────────────────────────────
--
-- `channel.storefront` aparece junto porque `checkout.guest` DEPENDE dele
-- (`requires` no registry): storefront desligado derruba o guest também, e sem
-- ver os dois lado a lado isso vira meia hora de confusão.
SELECT
  s."module_key",
  s."enabled"                                      AS "interruptor",
  coalesce(e."status"::text, '‹SEM DIREITO›')      AS "entitlement",
  CASE WHEN f."key" IS NULL THEN 'sem flag' ELSE f."enabled"::text END AS "release_flag"
FROM "tenant_settings" s
LEFT JOIN "tenant_entitlements" e
  ON e."tenant_id" = s."tenant_id" AND e."module_key" = s."module_key" AND e."deleted_at" IS NULL
LEFT JOIN "feature_flags" f ON f."key" = s."module_key"
WHERE s."tenant_id" = '019fa903-04e5-7755-8102-b176b2e0775f'
  AND s."module_key" IN ('checkout.guest', 'channel.storefront')
  AND s."deleted_at" IS NULL
ORDER BY s."module_key";

COMMIT;
