import { computePendingTransition, isAccessBlocked } from './subscription-lifecycle';
import { SubscriptionAlreadyCanceledError, SubscriptionCanceledError, TenantNotFoundError } from './subscription.errors';
import type { SubscriptionRepository, TenantSubscriptionRecord } from './subscription.repository';

export interface SubscriptionActor {
  id: string;
  role: string;
}

/**
 * Épico 13d — SEM job/cron nenhum: a transição é LAZY, computada e gravada
 * no exato momento em que alguém pergunta o status (mesmo desenho de
 * `ModuleService.isModuleActive` em packages/db — recompute por request, sem
 * scheduler externo). `apps/api` é processo Node de vida longa (CLAUDE.md),
 * mas isso não muda a escolha: BullMQ não é dependência deste repo hoje, e
 * introduzir uma pra um punhado de tenants do piloto seria infra sem
 * necessidade real. O ponto de disparo real é `TenantContextInterceptor`,
 * que chama `isAccessBlocked()` em toda request autenticada/pública — a
 * suspensão vale a partir da PRÓXIMA request depois do prazo vencer, não
 * instantânea, e isso é aceitável (mesma classe de tolerância de
 * `ModuleService`, cache de 60s).
 */
export class SubscriptionService {
  constructor(
    private readonly repo: SubscriptionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Lê o tenant, aplica a transição pendente (grava no banco) se houver, devolve o estado JÁ ATUALIZADO — nunca o valor obsoleto que só seria corrigido na próxima leitura. */
  async currentStatus(tenantId: string): Promise<TenantSubscriptionRecord> {
    const row = await this.repo.findTenant(tenantId);
    if (!row) throw new TenantNotFoundError();

    const transition = computePendingTransition(row, this.now());
    if (!transition) return row;

    const applied = await this.repo.applyAutomaticTransition(tenantId, row.status, transition);
    if (!applied) {
      // Corrida: outra request lazy já aplicou uma transição no meio-tempo —
      // relê pra pegar o estado real, nunca assume que a NOSSA versão venceu.
      const fresh = await this.repo.findTenant(tenantId);
      if (!fresh) throw new TenantNotFoundError();
      return fresh;
    }
    return { ...row, status: transition.toStatus, ...transition.patch };
  }

  /** Usado por `TenantContextInterceptor` — true bloqueia a request (backoffice E storefront). */
  async isAccessBlocked(tenantId: string): Promise<boolean> {
    const { status } = await this.currentStatus(tenantId);
    return isAccessBlocked(status);
  }

  /** Super-admin confirma "recebi o PIX/boleto" — reabre `active` a partir de QUALQUER estado não-cancelado, inclusive `suspended` (é exatamente o caso que existe pra resolver). */
  async markPaid(tenantId: string, periodDays: number, actor: SubscriptionActor): Promise<TenantSubscriptionRecord> {
    const current = await this.repo.findTenant(tenantId);
    if (!current) throw new TenantNotFoundError();
    if (current.status === 'canceled') throw new SubscriptionCanceledError();

    const periodEndsAt = new Date(this.now().getTime() + periodDays * 24 * 60 * 60 * 1000);
    return this.repo.markPaid(tenantId, periodEndsAt, actor);
  }

  /** "Cancelamento em 2 cliques" do lojista — nunca automático, e nunca um no-op silencioso se já cancelada. */
  async cancel(tenantId: string, actor: SubscriptionActor): Promise<TenantSubscriptionRecord> {
    const current = await this.repo.findTenant(tenantId);
    if (!current) throw new TenantNotFoundError();
    if (current.status === 'canceled') throw new SubscriptionAlreadyCanceledError();

    return this.repo.cancel(tenantId, actor);
  }
}
