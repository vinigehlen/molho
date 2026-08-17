-- Épico balcão (walk-in create) — dois métodos de pagamento novos, só pra
-- retirada paga na hora no caixa. PIX de balcão REUSA o valor `pix`
-- existente (mesmo QR/confirmação manual, só muda onde o cliente está).
--
-- Sozinho nesta migration DE PROPÓSITO: `ALTER TYPE ... ADD VALUE` precisa
-- commitar antes de o valor novo poder ser usado numa expressão (CHECK
-- constraint) — o CHECK que referencia estes dois valores vive na PRÓXIMA
-- migration, não nesta (mesma transação teria acusado "unsafe use of new
-- value of enum type").
--
-- Idempotente: `ADD VALUE IF NOT EXISTS` (replay do shadow database, CLAUDE.md
-- § convenções de schema).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'cash_at_counter';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'card_at_counter';
