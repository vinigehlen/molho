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
}
