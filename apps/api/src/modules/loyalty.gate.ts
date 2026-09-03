import { type ModuleCache, ModuleService, PrismaModuleDataSource } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface LoyaltyGate {
  /** `true` = módulo `loyalty` ativo pro tenant do request. */
  isActive(): Promise<boolean>;
}

/**
 * Checagem DINÂMICA do módulo `loyalty` — mesmo racional de
 * `PrismaCheckoutGuestGate`: dois consumidores em módulos diferentes
 * (`CheckoutOrderService` decide se resgata saldo, `LoyaltyCreditor` decide
 * se credita cashback ao completar), então vive em `modules/` pra nenhum dos
 * dois importar o outro. Módulo desligado no meio do caminho (revogado pelo
 * super-admin entre o pedido e a conclusão) tem que virar no-op silencioso,
 * nunca erro — mesmo princípio de "módulo desligado é não-destrutivo"
 * (CLAUDE.md regra 1): o saldo fica congelado, não se perde, só para de
 * mover enquanto o módulo estiver fora.
 */
export class PrismaLoyaltyGate implements LoyaltyGate {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly cache: ModuleCache,
  ) {}

  async isActive(): Promise<boolean> {
    const tenantId = this.requestContext.getTenantId();
    const moduleService = new ModuleService({
      db: new PrismaModuleDataSource(this.requestContext.getClient()),
      cache: this.cache,
    });
    return moduleService.isModuleActive(tenantId, 'loyalty');
  }
}
