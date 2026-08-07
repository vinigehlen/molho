-- Ponto do endereço vira OPCIONAL, e o pedido registra se o CEP foi
-- verificado (Épico 6, Bloco 2 — Mundo A com zona por cidade).
--
-- Com taxa por MUNICÍPIO, o preço é 100% determinado pela cidade: o ponto
-- não participa do cálculo, serve pro motoboy/mapa. "Nenhum ponto" é o
-- sintoma de OSM fora do ar — falha externa transitória que o cliente não
-- pode corrigir. Recusar um endereço válido por causa dela é perder pedido
-- por nada, então o ponto passa a ser best-effort.
--
-- NÃO existe fallback pro geo da loja: um pin falso mandaria o motoboy pro
-- lugar errado com aparência de dado bom. Ausente é ausente.
--
-- Auditoria feita antes desta migration: `geo`/`delivery_geo` são
-- WRITE-ONLY no repo inteiro (só o INSERT do checkout e o seed escrevem;
-- nenhum read-site — o gestor lê só as colunas de texto do snapshot). Por
-- isso tornar nullable não tem fallout de null-safety em display/SSE.
ALTER TABLE "addresses" ALTER COLUMN "geo" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "delivery_geo" DROP NOT NULL;

-- Falso quando o ViaCEP ficou mudo e a CIDADE que decidiu a taxa veio do
-- texto digitado pelo cliente, não de fonte autoritativa. O lojista confere
-- a taxa antes de despachar. `true` como default cobre todo pedido
-- existente: até aqui, cidade sempre veio do cliente com o endereço inteiro
-- conferido por ele — o caso novo é só o de decisão automática de taxa.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_postal_code_verified" BOOLEAN NOT NULL DEFAULT true;
