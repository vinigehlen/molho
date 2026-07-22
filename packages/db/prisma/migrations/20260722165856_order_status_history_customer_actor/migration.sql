-- Correção de design, sem linha real ainda existindo: order_status_history
-- só previa ator STAFF (actor_id → users). Mas a CRIAÇÃO do pedido — a
-- primeira linha desta tabela — é sempre iniciada pelo CLIENTE via
-- checkout, nunca por um funcionário; e cancelamento livre antes do aceite
-- (docs/02 §5.2) também é ação do cliente. customer_id preenche essa
-- lacuna. FK simples (não composta) pra customers(id) — a referência aqui
-- é só atribuição de autoria, o isolamento de tenant já vem do tenant_id
-- da própria linha via RLS.

ALTER TABLE "order_status_history" ADD COLUMN IF NOT EXISTS "customer_id" UUID;

DO $$ BEGIN
  ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
