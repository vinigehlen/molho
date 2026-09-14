-- Épico 20 (PDV + caixa) — PIN de staff, docs/HANDOFF-epico-20-pdv-caixa.md.
--
-- users.pin_hash: credencial de aprovação (sangria hoje; desconto manual/
-- cancelamento de pedido pago no futuro, mesmo endpoint verify-pin
-- reutilizável). scrypt via apps/api/src/security/scrypt-secret.ts.
--
-- Também corrige a migration anterior (20260914140000): o CHECK
-- "approved_by_user_id != requested_by_user_id" em cash_withdrawals estava
-- errado — owner/manager fazem sangria SOZINHOS, auto-aprovando (a
-- permissão deles não tem approval:true na matriz, packages/contracts/src/
-- permissions.ts). Só o CASHIER precisa de um segundo ator aprovando — e
-- essa distinção depende do PAPEL de quem pede, não dá pra expressar como
-- CHECK de colunas. Fica como regra de aplicação (CashWithdrawalService).
-- Ainda não tinha saído do branch, então dropar é seguro (nenhuma sangria
-- real foi gravada usando o schema antigo).
--
-- Idempotente (CLAUDE.md § convenções de schema).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pin_hash" TEXT;

ALTER TABLE "cash_withdrawals" DROP CONSTRAINT IF EXISTS "cash_withdrawals_approver_not_requester_check";
