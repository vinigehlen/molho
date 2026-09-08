import type { SubscriptionResponse } from '@molho/contracts';
import type { TenantSubscriptionRecord } from './subscription.repository';

export function toSubscriptionResponse(record: TenantSubscriptionRecord): SubscriptionResponse {
  return {
    status: record.status,
    planId: record.planId,
    trialEndsAt: record.trialEndsAt?.toISOString() ?? null,
    currentPeriodEndsAt: record.currentPeriodEndsAt?.toISOString() ?? null,
    pastDueAt: record.pastDueAt?.toISOString() ?? null,
    canceledAt: record.canceledAt?.toISOString() ?? null,
  };
}
