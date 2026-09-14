import type { CashSessionReportRow, CashSessionResponse, CashWithdrawalResponse } from '@molho/contracts';
import { Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import {
  CashSessionAlreadyOpenError,
  CashSessionNotFoundError,
  CashSessionStoreNotFoundError,
  CashSessionVersionConflictError,
} from './cash.errors';

export interface CashSessionRepository {
  getOpenForStore(storeId: string): Promise<CashSessionResponse | null>;
  /** `actorRole` só vira audit_log (CLAUDE.md regra 9 — ação sensível em dinheiro), nunca é checado aqui (RBAC já rodou no guard/service). */
  open(storeId: string, openedByUserId: string, actorRole: string, openingAmountCents: number): Promise<CashSessionResponse>;
  /**
   * `expectedAmountCents` é calculado AQUI (não recebido) — soma de vendas em
   * dinheiro do balcão vinculadas à sessão menos sangrias, no instante do
   * fechamento. Optimistic lock por `version` (CLAUDE.md § banco): dois
   * cliques de "fechar" ao mesmo tempo, o segundo perde.
   */
  close(
    sessionId: string,
    closedByUserId: string,
    actorRole: string,
    countedAmountCents: number,
    expectedVersion: number,
  ): Promise<CashSessionResponse>;
  createWithdrawal(
    sessionId: string,
    amountCents: number,
    reason: string | undefined,
    requestedByUserId: string,
    requestedByRole: string,
    approvedByUserId: string,
  ): Promise<CashWithdrawalResponse>;
  /** Sessões FECHADAS no período (decisão 8 do handoff) — sessão em andamento não tem quebra de caixa ainda. */
  listClosedForPeriod(storeId: string, from: Date, to: Date): Promise<CashSessionReportRow[]>;
}

export class PrismaCashSessionRepository implements CashSessionRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async getOpenForStore(storeId: string): Promise<CashSessionResponse | null> {
    const session = await this.requestContext.getClient().cashSession.findFirst({
      where: { storeId, status: 'open' },
    });
    return session ? toResponse(session) : null;
  }

  async open(storeId: string, openedByUserId: string, actorRole: string, openingAmountCents: number): Promise<CashSessionResponse> {
    await this.assertStoreExists(storeId);
    const tenantId = this.requestContext.getTenantId();
    const client = this.requestContext.getClient();
    try {
      const session = await client.cashSession.create({
        data: { tenantId, storeId, openedByUserId, openingAmountCents },
      });
      await this.recordAuditLog(tenantId, openedByUserId, actorRole, 'cash_session.open', session.id, null, {
        openingAmountCents,
      });
      return toResponse(session);
    } catch (error) {
      // Índice único parcial (tenant_id, store_id) WHERE status='open' —
      // corrida de dois "abrir caixa" ao mesmo tempo perde na constraint,
      // não em SELECT-antes-de-INSERT (que teria race window).
      if (isUniqueViolation(error)) throw new CashSessionAlreadyOpenError();
      throw error;
    }
  }

  async close(
    sessionId: string,
    closedByUserId: string,
    actorRole: string,
    countedAmountCents: number,
    expectedVersion: number,
  ): Promise<CashSessionResponse> {
    const client = this.requestContext.getClient();
    const session = await client.cashSession.findFirst({ where: { id: sessionId } });
    if (!session || session.status !== 'open') throw new CashSessionNotFoundError();

    const expectedAmountCents = await this.computeExpectedAmountCents(sessionId, session.openingAmountCents);

    const result = await client.cashSession.updateMany({
      where: { id: sessionId, version: expectedVersion, status: 'open' },
      data: {
        status: 'closed',
        closedByUserId,
        closedAt: new Date(),
        countedAmountCents,
        expectedAmountCents,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new CashSessionVersionConflictError();

    const updated = await client.cashSession.findUniqueOrThrow({ where: { id: sessionId } });
    await this.recordAuditLog(this.requestContext.getTenantId(), closedByUserId, actorRole, 'cash_session.close', sessionId, null, {
      countedAmountCents,
      expectedAmountCents,
      discrepancyCents: countedAmountCents - expectedAmountCents,
    });
    return toResponse(updated);
  }

  async createWithdrawal(
    sessionId: string,
    amountCents: number,
    reason: string | undefined,
    requestedByUserId: string,
    requestedByRole: string,
    approvedByUserId: string,
  ): Promise<CashWithdrawalResponse> {
    const tenantId = this.requestContext.getTenantId();
    const withdrawal = await this.requestContext.getClient().cashWithdrawal.create({
      data: { tenantId, cashSessionId: sessionId, amountCents, reason, requestedByUserId, approvedByUserId },
    });
    await this.recordAuditLog(tenantId, requestedByUserId, requestedByRole, 'cash_session.withdraw', withdrawal.id, null, {
      cashSessionId: sessionId,
      amountCents,
      approvedByUserId,
    });
    return {
      id: withdrawal.id,
      cashSessionId: withdrawal.cashSessionId,
      amountCents: withdrawal.amountCents,
      reason: withdrawal.reason,
      requestedByUserId: withdrawal.requestedByUserId,
      approvedByUserId: withdrawal.approvedByUserId,
      createdAt: withdrawal.createdAt.toISOString(),
    };
  }

  /** Ação sensível em dinheiro (CLAUDE.md regra 9) — mesmo shape de OrderStatusRepository.recordAuditLog. */
  private async recordAuditLog(
    tenantId: string,
    actorId: string,
    actorRole: string,
    action: string,
    entityId: string,
    beforeJson: Prisma.InputJsonValue | null,
    afterJson: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.requestContext.getClient().auditLog.create({
      data: { tenantId, actorId, actorRole, action, entity: `cash_session:${entityId}`, beforeJson: beforeJson ?? undefined, afterJson },
    });
  }

  async listClosedForPeriod(storeId: string, from: Date, to: Date): Promise<CashSessionReportRow[]> {
    const client = this.requestContext.getClient();
    const sessions = await client.cashSession.findMany({
      where: { storeId, status: 'closed', closedAt: { gte: from, lte: to } },
      orderBy: { closedAt: 'asc' },
    });
    if (sessions.length === 0) return [];

    const withdrawalTotals = await client.cashWithdrawal.groupBy({
      by: ['cashSessionId'],
      where: { cashSessionId: { in: sessions.map((s) => s.id) } },
      _sum: { amountCents: true },
    });
    const withdrawalsBySession = new Map(withdrawalTotals.map((w) => [w.cashSessionId, w._sum.amountCents ?? 0]));

    return sessions.map((s) => {
      const counted = s.countedAmountCents ?? 0;
      const expected = s.expectedAmountCents ?? 0;
      return {
        id: s.id,
        openedByUserId: s.openedByUserId,
        closedByUserId: s.closedByUserId,
        openedAt: s.openedAt.toISOString(),
        // closedAt não é null aqui — filtro é status:'closed', que só grava junto com closedAt (repository.close).
        closedAt: (s.closedAt as Date).toISOString(),
        openingAmountCents: s.openingAmountCents,
        countedAmountCents: counted,
        expectedAmountCents: expected,
        discrepancyCents: counted - expected,
        withdrawalsCents: withdrawalsBySession.get(s.id) ?? 0,
      };
    });
  }

  /** opening + Σ vendas em DINHEIRO do balcão da sessão - Σ sangrias. Cartão na hora não mexe na gaveta física, por isso fica de fora. */
  private async computeExpectedAmountCents(sessionId: string, openingAmountCents: number): Promise<number> {
    const client = this.requestContext.getClient();
    const [cashOrders, withdrawals] = await Promise.all([
      client.order.findMany({
        where: { cashSessionId: sessionId, paymentMethod: 'cash_at_counter' },
        select: { totalCents: true, currentTotalCents: true },
      }),
      client.cashWithdrawal.aggregate({
        where: { cashSessionId: sessionId },
        _sum: { amountCents: true },
      }),
    ]);
    const cashSalesCents = cashOrders.reduce((sum, o) => sum + (o.currentTotalCents ?? o.totalCents), 0);
    const withdrawnCents = withdrawals._sum.amountCents ?? 0;
    return openingAmountCents + cashSalesCents - withdrawnCents;
  }

  private async assertStoreExists(storeId: string): Promise<void> {
    const store = await this.requestContext.getClient().store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: { id: true },
    });
    if (!store) throw new CashSessionStoreNotFoundError();
  }
}

function toResponse(session: {
  id: string;
  storeId: string;
  status: string;
  openedAt: Date;
  openedByUserId: string;
  openingAmountCents: number;
  closedAt: Date | null;
  closedByUserId: string | null;
  countedAmountCents: number | null;
  expectedAmountCents: number | null;
  version: number;
}): CashSessionResponse {
  return {
    id: session.id,
    storeId: session.storeId,
    status: session.status as CashSessionResponse['status'],
    openedAt: session.openedAt.toISOString(),
    openedByUserId: session.openedByUserId,
    openingAmountCents: session.openingAmountCents,
    closedAt: session.closedAt?.toISOString() ?? null,
    closedByUserId: session.closedByUserId,
    countedAmountCents: session.countedAmountCents,
    expectedAmountCents: session.expectedAmountCents,
    version: session.version,
  };
}

/** Prisma P2002 (unique constraint) — mesmo critério de catalog/product.repository.ts. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
