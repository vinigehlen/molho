/**
 * Porta pro crédito de cashback (Épico 16b) — `orders/` só conhece esta
 * interface, nunca o módulo `loyalty` inteiro (evitaria ciclo: loyalty
 * também precisa ler pedidos pra debitar saldo no checkout). A implementação
 * de verdade vive em `loyalty/`, injetada por token em `OrderStatusService`.
 *
 * Sem-op silencioso é uma opção válida de implementação (módulo desligado,
 * tenant sem config) — nunca lança, cashback é um bônus, nunca bloqueia a
 * conclusão do pedido em si.
 */
export interface LoyaltyCreditor {
  creditForCompletedOrder(params: { tenantId: string; customerId: string; orderId: string; totalCents: number }): Promise<void>;
  /**
   * Devolve o saldo debitado no checkout quando o pedido cancela ANTES de
   * concluir (Épico 16.2) — `received`/`preparing` → `canceled`/
   * `auto_canceled`/`expired`. Escopo deliberadamente menor que o handoff
   * original: o clawback do lado "creditou e DEPOIS estornou" pressupõe
   * cancelar um pedido `completed`, e a máquina de estados NÃO tem essa
   * transição (`completed` é terminal, `LEGAL_TRANSITIONS.completed = []`)
   * — não existe hoje nenhum fluxo de estorno pós-conclusão pra disparar
   * esse clawback. Fica registrado como decisão consciente, não esquecimento;
   * revisitar quando/se um fluxo de estorno pós-conclusão for construído.
   */
  refundUsedBalance(params: { tenantId: string; customerId: string; orderId: string; cashbackUsedCents: number }): Promise<void>;
}
