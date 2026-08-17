-- Épico balcão (walk-in create) — parte 3. `counterOrderSchema.notes` é
-- campo do PEDIDO (não do item nem só do balcão), e `orders` não tinha
-- coluna nenhuma pra observação livre até aqui.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "notes" TEXT;
