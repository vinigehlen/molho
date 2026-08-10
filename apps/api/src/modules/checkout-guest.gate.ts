import { type ModuleCache, ModuleService, PrismaModuleDataSource } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface CheckoutGuestGate {
  /** `true` = o tenant do request aceita pedido sem OTP (CLAUDE.md regra 13, EMENDA). */
  isActive(): Promise<boolean>;
}

/**
 * Checagem DINÂMICA do módulo `checkout.guest` — não dá pra usar
 * `@RequireModule`, que devolveria 403 com o módulo inativo: aqui inativo
 * significa "exija OTP", não "recuse a rota". Mesmo racional (e mesma forma)
 * de `PrismaPaymentMethodModuleGate`.
 *
 * Vive em `modules/` e não em `orders/` porque tem DOIS consumidores em
 * módulos diferentes: `CheckoutOrderService` (decide 401 vs guest) e
 * `StorefrontService` (informa o front por `guestCheckout` no payload
 * público). Pôr em `orders/` faria `StorefrontModule` importar `OrdersModule`,
 * que já importa `StorefrontModule` — ciclo.
 *
 * `ModuleService`/`PrismaModuleDataSource` construídos por REQUEST, nunca
 * singleton: `PrismaModuleDataSource` só pode usar o client transacional do
 * request (CLAUDE.md § Contexto de request).
 */
export class PrismaCheckoutGuestGate implements CheckoutGuestGate {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly cache: ModuleCache,
  ) {}

  async isActive(): Promise<boolean> {
    // Tenant do próprio contexto de request, como
    // `PrismaAvailablePaymentMethodsResolver` — os dois consumidores já rodam
    // dentro do `.run()`, e receber o id por parâmetro só daria a chance de
    // alguém passar um tenant que não é o do request.
    const tenantId = this.requestContext.getTenantId();
    const moduleService = new ModuleService({
      db: new PrismaModuleDataSource(this.requestContext.getClient()),
      cache: this.cache,
    });
    return moduleService.isModuleActive(tenantId, 'checkout.guest');
  }
}
