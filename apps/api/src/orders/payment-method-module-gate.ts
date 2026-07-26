import { type ModuleCache, ModuleService, PrismaModuleDataSource } from '@molho/db';
import { PAYMENT_METHOD_MODULE, type PaymentMethod } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import { PaymentMethodNotAvailableError } from './order-errors';

export interface PaymentMethodModuleGate {
  /** Lança PaymentMethodNotAvailableError se o tenant não tem o módulo do método ligado. */
  assertAvailable(tenantId: string, paymentMethod: PaymentMethod): Promise<void>;
}

/**
 * Checagem de módulo DINÂMICA, dentro do service — não dá pra saber qual
 * módulo checar via `@RequireModule` estático (decorator de classe), porque
 * depende do `paymentMethod` que só chega no BODY da request. Mesmo
 * `ModuleService`/`PrismaModuleDataSource` construídos por request que
 * `RequireModuleGuard` já usa (CLAUDE.md § Contexto de request:
 * `PrismaModuleDataSource` só pode usar o client transacional do request).
 */
export class PrismaPaymentMethodModuleGate implements PaymentMethodModuleGate {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly cache: ModuleCache,
  ) {}

  async assertAvailable(tenantId: string, paymentMethod: PaymentMethod): Promise<void> {
    const moduleService = new ModuleService({
      db: new PrismaModuleDataSource(this.requestContext.getClient()),
      cache: this.cache,
    });
    const active = await moduleService.isModuleActive(tenantId, PAYMENT_METHOD_MODULE[paymentMethod]);
    if (!active) throw new PaymentMethodNotAvailableError(paymentMethod);
  }
}
