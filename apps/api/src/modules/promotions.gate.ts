import { type ModuleCache, ModuleService, PrismaModuleDataSource } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface PromotionsGate {
  /** `true` = módulo `promotions` ativo pro tenant do request. */
  isActive(): Promise<boolean>;
}

/**
 * Checagem DINÂMICA do módulo `promotions` — mesmo racional de
 * `PrismaLoyaltyGate`/`PrismaCheckoutGuestGate`: `CheckoutRevalidationService`
 * decide se busca promoções ativas, e um guard estático (`@RequireModule`)
 * não expressa "desligado no meio do checkout = simplesmente não aplica
 * desconto nenhum" (nunca erro — CLAUDE.md regra 1, módulo desligado é
 * não-destrutivo). Vive em `modules/` pra `orders/` não importar
 * `promotions/` direto (porta/adapter, mesmo padrão de `loyalty-creditor.port.ts`).
 */
export class PrismaPromotionsGate implements PromotionsGate {
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
    return moduleService.isModuleActive(tenantId, 'promotions');
  }
}
