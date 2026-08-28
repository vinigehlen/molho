-- Fase 3 do plano do gestor de pedidos — sinalização manual de pendência
-- (versão MVP da "tag de pendência" do iFood, que lá é automática por
-- chat/negociação in-app; aqui é o staff marcando na mão).
--
-- Escrita à mão, aditiva, idempotente (mesmo motivo das fases do combo,
-- docs/07): migrations/ local está atrás de uma migration já aplicada no
-- banco real.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "flagged_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "flagged_reason" TEXT;
