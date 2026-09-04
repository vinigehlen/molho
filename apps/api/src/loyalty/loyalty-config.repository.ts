import { Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import { LoyaltyConfigConflictError } from './loyalty.errors';

export interface LoyaltyConfigRecord {
  cashbackPercent: number;
  version: number;
}

/** Sugestão ao ligar o módulo (D5) — mesma coluna @default da migration, aqui só pro caso de nunca ter sido salvo. */
const SUGGESTED_CASHBACK_PERCENT = 5;

const SELECT = { cashbackPercent: true, version: true } as const;

export interface LoyaltyConfigRepository {
  /**
   * Registro CRU do banco — `null` quando o lojista nunca salvou nada.
   * Único método que `RealLoyaltyCreditor` pode usar (Épico 16.4): a
   * distinção "nunca configurado" vs "configurado com o mesmo valor da
   * sugestão" só existe aqui. `get()` colapsa os dois em `version: 0`, o
   * que é correto pro FORM de admin (pré-preenche com a sugestão) mas
   * teria sido fail-OPEN se o creditor usasse — creditaria 5% de cashback
   * de verdade sem o lojista jamais ter confirmado percentual nenhum.
   */
  find(): Promise<LoyaltyConfigRecord | null>;
  get(): Promise<LoyaltyConfigRecord>;
  update(cashbackPercent: number, expectedVersion: number): Promise<LoyaltyConfigRecord>;
}

export class PrismaLoyaltyConfigRepository implements LoyaltyConfigRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async find(): Promise<LoyaltyConfigRecord | null> {
    const tenantId = this.requestContext.getTenantId();
    return this.requestContext.getClient().loyaltyConfig.findUnique({ where: { tenantId }, select: SELECT });
  }

  async get(): Promise<LoyaltyConfigRecord> {
    return (await this.find()) ?? { cashbackPercent: SUGGESTED_CASHBACK_PERCENT, version: 0 };
  }

  async update(cashbackPercent: number, expectedVersion: number): Promise<LoyaltyConfigRecord> {
    const client = this.requestContext.getClient();
    const tenantId = this.requestContext.getTenantId();

    if (expectedVersion === 0) {
      // version 0 = "nunca foi salvo" (get() devolve isso quando a linha não
      // existe) — tenta CRIAR. Se já existe (corrida rara: dois PUTs quase
      // juntos na primeira configuração), trata como conflito de verdade —
      // nunca sobrescreve silenciosamente o que a outra request acabou de
      // gravar.
      try {
        return await client.loyaltyConfig.create({ data: { tenantId, cashbackPercent }, select: SELECT });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new LoyaltyConfigConflictError();
        }
        throw error;
      }
    }

    const result = await client.loyaltyConfig.updateMany({
      where: { tenantId, version: expectedVersion, deletedAt: null },
      data: { cashbackPercent, version: { increment: 1 } },
    });
    if (result.count === 0) throw new LoyaltyConfigConflictError();
    const updated = await client.loyaltyConfig.findUnique({ where: { tenantId }, select: SELECT });
    if (!updated) throw new LoyaltyConfigConflictError();
    return updated;
  }
}
