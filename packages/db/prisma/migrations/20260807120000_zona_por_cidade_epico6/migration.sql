-- Zona de entrega POR CIDADE, além de por polígono (Épico 6 — pivot).
--
-- A Cabanhas cobra taxa fixa por município (Estância Velha R$8; Portão/
-- Ivoti/Novo Hamburgo R$15), não por distância — raio cobraria errado. O
-- caminho polygon/ST_Covers CONTINUA VIVO pra tenants que cobram por raio:
-- a escolha é POR ZONA (XOR abaixo), nunca uma flag global de tenant, então
-- um mesmo tenant pode ter zonas dos dois tipos.

ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "state" TEXT;

-- Zona por cidade não tem geometria nenhuma.
ALTER TABLE "delivery_zones" ALTER COLUMN "polygon" DROP NOT NULL;

-- Chave de comparação de cidade: minúscula, sem acento, sem espaço nas
-- pontas — pra "Estância Velha" (ViaCEP), "estancia velha " (lojista
-- digitando) e "ESTÂNCIA VELHA" casarem entre si.
--
-- `lower()` roda ANTES do `translate()` de propósito: assim o mapa de
-- acentos tem 24 caracteres em vez de 48. `translate` REMOVE (não preserva)
-- os caracteres de `from` que não têm par em `to`, então um descuido de
-- contagem viraria fora-de-área silencioso — metade do mapa é metade do
-- risco. O e2e testa "Estância" (â) e "Portão" (ã) nominalmente por isso.
--
-- `translate` em vez da extensão `unaccent`: além de ser dependência nova,
-- `unaccent` NÃO é IMMUTABLE e por isso nem serviria no índice abaixo.
CREATE OR REPLACE FUNCTION molho_city_key(nome text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
    SELECT translate(lower(btrim(nome)),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn')
  $$;

-- XOR por ZONA: ou é por cidade, ou é por polígono, nunca os dois nem
-- nenhum. `state` anda junto de `city` — "Estância Velha" sem UF é ambíguo
-- no Brasil.
ALTER TABLE "delivery_zones" DROP CONSTRAINT IF EXISTS "delivery_zones_city_xor_polygon";
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_city_xor_polygon" CHECK (
     ("city" IS NOT NULL AND "state" IS NOT NULL AND "polygon" IS NULL)
  OR ("city" IS NULL     AND "state" IS NULL     AND "polygon" IS NOT NULL)
);

-- Uma zona por (loja, cidade). Parcial em `deleted_at` (CLAUDE.md: única
-- que interage com soft delete vira parcial) e parcial em `city` (zona por
-- polígono não entra). Serve de índice do match E impede que o hand-seed
-- rodado duas vezes crie zona duplicada.
--
-- `upper(btrim("state"))` espelha o `btrim` que o molho_city_key já faz no
-- city: um "RS " com espaço perdido no seed ou no form viraria fora-de-área
-- silencioso. A query de match usa a MESMA expressão, senão o índice não
-- alinha.
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_zones_tenant_store_city_key"
  ON "delivery_zones"("tenant_id", "store_id", molho_city_key("city"), upper(btrim("state")))
  WHERE "deleted_at" IS NULL AND "city" IS NOT NULL;
