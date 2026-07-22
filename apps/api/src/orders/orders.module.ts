import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { PrismaDeliveryMatchRepository } from '../storefront/delivery-match.repository';
import { CheckoutController } from './checkout.controller';
import { PrismaCheckoutOrderRepository } from './checkout-order.repository';
import { CheckoutOrderService } from './checkout-order.service';
import { PrismaCheckoutRepository } from './checkout-revalidation.repository';
import { CheckoutRevalidationService } from './checkout-revalidation.service';
import { PrismaOrderStatusRepository } from './order-status.repository';
import { OrderStatusService } from './order-status.service';
import { CHECKOUT_ORDER_SERVICE, CHECKOUT_REVALIDATION_SERVICE } from './orders.tokens';

export { CHECKOUT_REVALIDATION_SERVICE, CHECKOUT_ORDER_SERVICE };

/**
 * TokenModule e StorefrontModule entram aqui em ADIÇÃO a AuthModule pelo
 * mesmo motivo documentado em CatalogModule: guard referenciado por CLASSE
 * em `@UseGuards()` (`CustomerJwtAuthGuard`, `StorefrontRateLimitGuard`,
 * `RequireModuleGuard`) resolve suas PRÓPRIAS dependências (respectivamente
 * `CUSTOMER_TOKEN_SERVICE`, `STOREFRONT_RATE_LIMITER`, o cache de módulos)
 * no injector do módulo que declara o CONTROLLER — `AuthModule` exporta as
 * classes dos guards, mas não re-exporta os tokens que eles próprios
 * precisam.
 */
@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule, StorefrontModule],
  controllers: [CheckoutController],
  providers: [
    {
      provide: CHECKOUT_REVALIDATION_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): CheckoutRevalidationService =>
        new CheckoutRevalidationService(
          new PrismaCheckoutRepository(requestContext),
          new PrismaDeliveryMatchRepository(requestContext),
        ),
    },
    {
      provide: CHECKOUT_ORDER_SERVICE,
      inject: [RequestContextService, CHECKOUT_REVALIDATION_SERVICE],
      useFactory: (
        requestContext: RequestContextService,
        revalidationService: CheckoutRevalidationService,
      ): CheckoutOrderService =>
        new CheckoutOrderService(
          new PrismaCheckoutOrderRepository(requestContext),
          revalidationService,
          new OrderStatusService(new PrismaOrderStatusRepository(requestContext)),
        ),
    },
  ],
  exports: [CHECKOUT_REVALIDATION_SERVICE, CHECKOUT_ORDER_SERVICE],
})
export class OrdersModule {}
