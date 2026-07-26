import { type ModuleCache, ModuleService, PrismaModuleDataSource } from '@molho/db';
import { PAYMENT_METHOD_MODULE, type PaymentMethod } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';

/** Recorte de `StorefrontStoreRecord` — só os campos que decidem se `pix` pode entrar na lista. */
export interface StoreForPaymentMethods {
  pixKey: string | null;
  pixKeyType: string | null;
  pixMerchantCity: string | null;
}

export interface AvailablePaymentMethodsResolver {
  /** `store: null` = loja ainda não cadastrada (onboarding incompleto) — nenhum método pronto, `pix` nem entra na conta. */
  list(store: StoreForPaymentMethods | null): Promise<PaymentMethod[]>;
}

/**
 * Um método só entra na lista se: módulo ativo E (só pra `pix`) a chave PIX
 * configurada. `cash_on_delivery`/`card_on_delivery` não têm pré-requisito
 * de config além do módulo — docs/02-definicoes-v1.md §5.5. Mesmo
 * `ModuleService` construído por request que `RequireModuleGuard` e
 * `PrismaPaymentMethodModuleGate` já usam (CLAUDE.md § Contexto de request).
 */
export class PrismaAvailablePaymentMethodsResolver implements AvailablePaymentMethodsResolver {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly cache: ModuleCache,
  ) {}

  async list(store: StoreForPaymentMethods | null): Promise<PaymentMethod[]> {
    const tenantId = this.requestContext.getTenantId();
    const moduleService = new ModuleService({
      db: new PrismaModuleDataSource(this.requestContext.getClient()),
      cache: this.cache,
    });

    const [pixActive, onDeliveryActive] = await Promise.all([
      moduleService.isModuleActive(tenantId, PAYMENT_METHOD_MODULE.pix),
      moduleService.isModuleActive(tenantId, PAYMENT_METHOD_MODULE.cash_on_delivery),
    ]);

    const methods: PaymentMethod[] = [];
    const pixConfigured = store !== null && !!store.pixKey && !!store.pixKeyType && !!store.pixMerchantCity;
    if (pixActive && pixConfigured) methods.push('pix');
    if (onDeliveryActive) methods.push('cash_on_delivery', 'card_on_delivery');
    return methods;
  }
}
