-- Snapshot imutável do prazo prometido. Pedidos legados ficam NULL e a UI
-- explicita "Prazo não registrado" em vez de inventar uma estimativa atual.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "fulfillment_deadline_at" TIMESTAMP(3);
