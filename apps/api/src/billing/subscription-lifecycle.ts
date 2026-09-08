import type { SubscriptionStatus } from '@molho/contracts';

/**
 * Épico 13d — ciclo de vida da ASSINATURA da conta (não confundir com
 * `TenantEntitlement.trialEndsAt`, trial de MÓDULO). Cobrança MANUAL no
 * piloto (CLAUDE.md, 2026-09-04): sem PSP recorrente ainda (épicos 24-26),
 * o super-admin confirma "recebi o PIX/boleto" na mão. Este arquivo só
 * decide QUANDO uma transição automática é devida — nunca toca banco (mesmo
 * desenho puro de order-status-machine.ts).
 *
 * `trial → active → past_due → suspended` é uma linha só; `canceled` só
 * chega por ação EXPLÍCITA do lojista (nunca automático, ver
 * subscription.service.ts). `suspended`/`canceled` são terminais pra
 * automação — só saem por ação manual do super-admin (marcar pago sempre
 * reabre pra `active`; `canceled` não tem essa saída, é definitivo).
 */

/** docs/02-definicoes-v1.md §7 item 10 (termos legais): "aviso, 7 dias, depois bloqueio". Trial que expira NÃO usa esta folga — trial não é inadimplência, é o fim do que sempre foi grátis. */
export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 7;

export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  pastDueAt: Date | null;
}

export interface SubscriptionTransition {
  toStatus: SubscriptionStatus;
  /** Timestamp que a transição precisa GRAVAR junto — `pastDueAt` é a âncora fixa da folga (nunca recalculada depois, ver comentário no schema.prisma). */
  patch: { pastDueAt?: Date };
}

/**
 * `null` = nenhuma transição pendente (o `status` gravado já é o correto
 * pra `now`). Nunca pula estado (trial não vai direto pra `past_due`,
 * `active` não vai direto pra `suspended`) — cada camada de folga só é
 * avaliada depois que a de cima já decidiu não se aplicar.
 */
export function computePendingTransition(snapshot: SubscriptionSnapshot, now: Date): SubscriptionTransition | null {
  switch (snapshot.status) {
    case 'trial':
      if (snapshot.trialEndsAt && now >= snapshot.trialEndsAt) {
        return { toStatus: 'suspended', patch: {} };
      }
      return null;

    case 'active':
      // currentPeriodEndsAt null = venda assistida sem relógio de cobrança
      // ainda rodando (immediate=true no provisionamento, Épico 14) —
      // nunca expira sozinho até o super-admin confirmar o 1º pagamento.
      if (snapshot.currentPeriodEndsAt && now >= snapshot.currentPeriodEndsAt) {
        return { toStatus: 'past_due', patch: { pastDueAt: now } };
      }
      return null;

    case 'past_due': {
      if (!snapshot.pastDueAt) return null; // defensivo: nunca deveria acontecer (patch acima sempre grava junto)
      const graceEndsAt = new Date(snapshot.pastDueAt.getTime() + SUBSCRIPTION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
      if (now >= graceEndsAt) return { toStatus: 'suspended', patch: {} };
      return null;
    }

    case 'suspended':
    case 'canceled':
      return null;
  }
}

/** `suspended`/`canceled` bloqueiam acesso (backoffice E storefront); `trial`/`active`/`past_due` continuam operando normal — past_due é "aviso", não "bloqueio" (docs/02 §7). */
export function isAccessBlocked(status: SubscriptionStatus): boolean {
  return status === 'suspended' || status === 'canceled';
}
