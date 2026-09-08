import type { SubscriptionStatus } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import type { SubscriptionSnapshot, SubscriptionTransition } from './subscription-lifecycle';

export interface TenantSubscriptionRecord extends SubscriptionSnapshot {
  id: string;
  planId: string | null;
  canceledAt: Date | null;
}

const SELECT = {
  id: true,
  planId: true,
  status: true,
  trialEndsAt: true,
  currentPeriodEndsAt: true,
  pastDueAt: true,
  canceledAt: true,
} as const;

export interface SubscriptionRepository {
  findTenant(tenantId: string): Promise<TenantSubscriptionRecord | null>;
  /** Transição AUTOMÁTICA (lazy, sem ator) — `WHERE status = fromStatus` é o guard otimista: corrida com outra request lazy no mesmo instante perde de graça, sem erro (quem perdeu relê o estado já atualizado). */
  applyAutomaticTransition(tenantId: string, fromStatus: SubscriptionStatus, transition: SubscriptionTransition): Promise<boolean>;
  /** Ação MANUAL do super-admin — sempre grava audit_log (tem ator real). */
  markPaid(tenantId: string, periodEndsAt: Date, actor: { id: string; role: string }): Promise<TenantSubscriptionRecord>;
  /** Ação MANUAL do lojista ("cancelamento em 2 cliques") — sempre grava audit_log. */
  cancel(tenantId: string, actor: { id: string; role: string }): Promise<TenantSubscriptionRecord>;
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findTenant(tenantId: string): Promise<TenantSubscriptionRecord | null> {
    const client = this.requestContext.getClient();
    return client.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: SELECT });
  }

  async applyAutomaticTransition(
    tenantId: string,
    fromStatus: SubscriptionStatus,
    transition: SubscriptionTransition,
  ): Promise<boolean> {
    const client = this.requestContext.getClient();
    const result = await client.tenant.updateMany({
      where: { id: tenantId, status: fromStatus, deletedAt: null },
      data: { status: transition.toStatus, ...transition.patch },
    });
    return result.count > 0;
  }

  async markPaid(tenantId: string, periodEndsAt: Date, actor: { id: string; role: string }): Promise<TenantSubscriptionRecord> {
    const client = this.requestContext.getClient();
    const updated = await client.tenant.update({
      where: { id: tenantId },
      // Pago de verdade fecha o trial pra sempre (trialEndsAt null — nunca
      // mais volta a valer) e zera o relógio de atraso (pastDueAt null),
      // mesmo se o pagamento chegou já dentro da folga de past_due.
      data: { status: 'active', currentPeriodEndsAt: periodEndsAt, trialEndsAt: null, pastDueAt: null },
      select: SELECT,
    });

    await client.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorRole: actor.role,
        action: 'platform.subscription_mark_paid',
        entity: 'tenant',
        afterJson: { status: 'active', currentPeriodEndsAt: periodEndsAt.toISOString() },
      },
    });

    return updated;
  }

  async cancel(tenantId: string, actor: { id: string; role: string }): Promise<TenantSubscriptionRecord> {
    const client = this.requestContext.getClient();
    const now = new Date();
    const updated = await client.tenant.update({
      where: { id: tenantId },
      data: { status: 'canceled', canceledAt: now },
      select: SELECT,
    });

    await client.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorRole: actor.role,
        action: 'billing.subscription_cancel',
        entity: 'tenant',
        afterJson: { status: 'canceled', canceledAt: now.toISOString() },
      },
    });

    return updated;
  }
}
