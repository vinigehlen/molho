import type { LoyaltyCreditor } from '../orders/loyalty-creditor.port';
import type { LoyaltyGate } from '../modules/loyalty.gate';
import type { LoyaltyBalanceRepository } from './loyalty-balance.repository';
import type { LoyaltyConfigRepository } from './loyalty-config.repository';

/**
 * Implementação real da porta que `orders/` consome (Épico 16b, D2/D5) —
 * módulo desligado ou sem configuração salva nunca lança, só credita 0
 * (mesmo princípio de "módulo desligado é não-destrutivo").
 *
 * Épico 16.4: usa `config.find()`, NUNCA `config.get()` — `get()` devolve a
 * SUGESTÃO de 5% quando o lojista nunca salvou nada (é o que o form de admin
 * pré-preenche), e usar isso aqui creditaria cashback de verdade sem
 * consentimento nenhum. Ausência de config é a mesma ponta permissiva de
 * `checkout.guest` (CLAUDE.md regra 13): ausência de linha = desligado.
 */
export class RealLoyaltyCreditor implements LoyaltyCreditor {
  constructor(
    private readonly gate: LoyaltyGate,
    private readonly config: LoyaltyConfigRepository,
    private readonly balance: LoyaltyBalanceRepository,
  ) {}

  async creditForCompletedOrder(params: { tenantId: string; customerId: string; orderId: string; totalCents: number }): Promise<void> {
    if (!(await this.gate.isActive())) return;
    const config = await this.config.find();
    if (!config) return;
    const amountCents = Math.round((params.totalCents * config.cashbackPercent) / 100);
    await this.balance.credit(params.customerId, params.orderId, amountCents);
  }

  /**
   * Devolução de saldo usado (Épico 16.2) — mesma operação de crédito
   * (`balance.credit`): incrementa `loyalty_balances` e grava um
   * `loyalty_events` tipo `earn` com o MESMO `orderId` do pedido cancelado.
   * O extrato (16.1) então mostra "usou" (derivado de
   * `orders.cashback_used_cents`, que fica como está — o pedido REALMENTE
   * usou saldo, cancelar depois não apaga o fato) seguido de "ganhou" (a
   * devolução) — histórico verdadeiro, não escondido.
   *
   * Sem gate de módulo aqui de propósito: se o saldo foi debitado (o módulo
   * estava ativo no momento do checkout), devolver não pode depender do
   * módulo continuar ativo agora — dinheiro do cliente não fica preso porque
   * o lojista desligou fidelidade depois.
   */
  async refundUsedBalance(params: { tenantId: string; customerId: string; orderId: string; cashbackUsedCents: number }): Promise<void> {
    await this.balance.credit(params.customerId, params.orderId, params.cashbackUsedCents);
  }
}
