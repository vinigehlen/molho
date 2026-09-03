import type { RequestContextService } from '../context/request-context.service';

export interface LoyaltyBalanceRepository {
  getBalance(customerId: string): Promise<number>;
  /** Crédito por pedido `completed` (Épico 16b, D2) — upsert atômico + evento no ledger. */
  credit(customerId: string, orderId: string, amountCents: number): Promise<void>;
}

export class PrismaLoyaltyBalanceRepository implements LoyaltyBalanceRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async getBalance(customerId: string): Promise<number> {
    const row = await this.requestContext.getClient().loyaltyBalance.findUnique({
      where: { customerId },
      select: { balanceCents: true },
    });
    return row?.balanceCents ?? 0;
  }

  async credit(customerId: string, orderId: string, amountCents: number): Promise<void> {
    if (amountCents <= 0) return;
    const client = this.requestContext.getClient();
    const tenantId = this.requestContext.getTenantId();
    await client.$executeRaw`
      INSERT INTO loyalty_balances (customer_id, tenant_id, balance_cents, version)
      VALUES (${customerId}::uuid, ${tenantId}::uuid, ${amountCents}::int, 0)
      ON CONFLICT (customer_id) DO UPDATE
      SET balance_cents = loyalty_balances.balance_cents + EXCLUDED.balance_cents,
          version = loyalty_balances.version + 1
    `;
    // `redeem` fica sem linha própria de ledger — `orders.cashback_used_cents`
    // já é o registro auditável (mesmo racional do cupom, que também não tem
    // ledger próprio, só as colunas no pedido). `earn` grava aqui porque é o
    // único lado que só existe DENTRO desta tabela — sem isso, "quanto cada
    // pedido creditou" some depois que balanceCents soma tudo junto.
    await client.loyaltyEvent.create({ data: { tenantId, customerId, orderId, type: 'earn', amountCents } });
  }
}
