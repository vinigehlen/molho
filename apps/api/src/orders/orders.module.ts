import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import {
  InMemorySlidingWindowRateLimiter,
  type RateLimiter,
  RedisSlidingWindowRateLimiter,
} from '../rate-limit/rate-limiter';
import type { ModuleCache } from '@molho/db';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { MODULE_CACHE, ModuleCheckModule } from '../modules/module-check.module';
import { PrismaCheckoutGuestGate } from '../modules/checkout-guest.gate';
import { PrintingModule } from '../printing/printing.module';
import { CustomerIdentityRepository } from '../auth/customer-identity.repository';
import { StorefrontModule } from '../storefront/storefront.module';
import { PrismaDeliveryMatchRepository } from '../storefront/delivery-match.repository';
import { CheckoutController } from './checkout.controller';
import { CheckoutOrderRateLimitMiddleware } from './checkout-order-rate-limit.middleware';
import { PrismaCheckoutOrderRepository } from './checkout-order.repository';
import { CheckoutOrderService } from './checkout-order.service';
import { CounterOrderController } from './counter-order.controller';
import { PrismaCounterOrderRepository } from './counter-order.repository';
import { CounterOrderService } from './counter-order.service';
import { PrismaCheckoutRepository } from './checkout-revalidation.repository';
import { CheckoutRevalidationService } from './checkout-revalidation.service';
import { PrismaAdminOrderRepository } from './admin-order.repository';
import { OrderAdjustmentController } from './order-adjustment.controller';
import { PrismaOrderAdjustmentRepository } from './order-adjustment.repository';
import { OrderAdjustmentService } from './order-adjustment.service';
import { OrderAdminController } from './order-admin.controller';
import { OrderPaymentController } from './order-payment.controller';
import { OrderTrackingController } from './order-tracking.controller';
import { PrismaOrderTrackingRepository } from './order-tracking.repository';
import { OrderTrackingService } from './order-tracking.service';
import { PrismaOrderStatusRepository } from './order-status.repository';
import { OrderStatusService } from './order-status.service';
import { InMemoryOrderEventBus, RedisOrderEventBus, type OrderEventBus } from './realtime/order-event-bus';
import { OrderPublishInterceptor } from './realtime/order-publish.interceptor';
import { OrderStreamController } from './realtime/order-stream.controller';
import { StreamCookieAuthGuard } from './realtime/stream-cookie-auth.guard';
import {
  ADMIN_ORDER_REPOSITORY,
  CHECKOUT_ORDER_RATE_LIMITER,
  CHECKOUT_ORDER_SERVICE,
  CHECKOUT_REVALIDATION_SERVICE,
  COUNTER_ORDER_SERVICE,
  ORDER_ADJUSTMENT_SERVICE,
  ORDER_EVENT_BUS,
  ORDER_FLAG_SERVICE,
  ORDER_TRACKING_SERVICE,
  ORDER_STATUS_SERVICE,
  PAYMENT_CONFIRMATION_SERVICE,
} from './orders.tokens';
import { PrismaOrderFlagRepository } from './order-flag.repository';
import { OrderFlagService } from './order-flag.service';
import { PrismaPaymentConfirmationRepository } from './payment-confirmation.repository';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { PrismaPaymentMethodModuleGate } from './payment-method-module-gate';

export { CHECKOUT_REVALIDATION_SERVICE, CHECKOUT_ORDER_SERVICE, PAYMENT_CONFIRMATION_SERVICE };

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
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule, StorefrontModule, PrintingModule],
  controllers: [
    CheckoutController,
    OrderPaymentController,
    OrderStreamController,
    OrderAdminController,
    OrderTrackingController,
    CounterOrderController,
    OrderAdjustmentController,
  ],
  providers: [
    StreamCookieAuthGuard,
    OrderPublishInterceptor,
    CheckoutOrderRateLimitMiddleware,
    {
      provide: COUNTER_ORDER_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): CounterOrderService =>
        new CounterOrderService(
          new PrismaCounterOrderRepository(requestContext),
          new PrismaOrderStatusRepository(requestContext),
        ),
    },
    {
      // Mesmo padrão dos outros limitadores: sem REDIS_URL cai em memória (dev
      // de uma instância só); em produção com 2 instâncias só o Redis conta
      // certo, senão o cap dobra na prática.
      provide: CHECKOUT_ORDER_RATE_LIMITER,
      useFactory: (): RateLimiter => {
        const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
        return redis ? new RedisSlidingWindowRateLimiter(redis) : new InMemorySlidingWindowRateLimiter();
      },
    },
    {
      provide: ORDER_STATUS_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): OrderStatusService =>
        new OrderStatusService(new PrismaOrderStatusRepository(requestContext)),
    },
    {
      provide: ADMIN_ORDER_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new PrismaAdminOrderRepository(requestContext),
    },
    {
      provide: ORDER_ADJUSTMENT_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): OrderAdjustmentService =>
        new OrderAdjustmentService(new PrismaOrderAdjustmentRepository(requestContext)),
    },
    {
      // Singleton do processo: segura os subscribers SSE entre requests. Redis
      // pub/sub em produção (duas conexões — sub em modo subscriber não aceita
      // outros comandos); in-memory sem REDIS_URL (dev/test, uma instância).
      provide: ORDER_EVENT_BUS,
      useFactory: (): OrderEventBus =>
        process.env.REDIS_URL
          ? new RedisOrderEventBus(new Redis(process.env.REDIS_URL), new Redis(process.env.REDIS_URL))
          : new InMemoryOrderEventBus(),
    },
    {
      provide: PAYMENT_CONFIRMATION_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): PaymentConfirmationService =>
        new PaymentConfirmationService(new PrismaPaymentConfirmationRepository(requestContext)),
    },
    {
      provide: ORDER_FLAG_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): OrderFlagService =>
        new OrderFlagService(new PrismaOrderFlagRepository(requestContext)),
    },
    {
      provide: ORDER_TRACKING_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): OrderTrackingService =>
        new OrderTrackingService(new PrismaOrderTrackingRepository(requestContext)),
    },
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
      inject: [RequestContextService, CHECKOUT_REVALIDATION_SERVICE, MODULE_CACHE],
      useFactory: (
        requestContext: RequestContextService,
        revalidationService: CheckoutRevalidationService,
        moduleCache: ModuleCache,
      ): CheckoutOrderService =>
        new CheckoutOrderService(
          new PrismaCheckoutOrderRepository(requestContext),
          revalidationService,
          new OrderStatusService(new PrismaOrderStatusRepository(requestContext)),
          new PrismaPaymentMethodModuleGate(requestContext, moduleCache),
          new PrismaCheckoutGuestGate(requestContext, moduleCache),
          new CustomerIdentityRepository(requestContext),
        ),
    },
  ],
  exports: [
    CHECKOUT_REVALIDATION_SERVICE,
    CHECKOUT_ORDER_SERVICE,
    PAYMENT_CONFIRMATION_SERVICE,
    CheckoutOrderRateLimitMiddleware,
    // O middleware é aplicado em `AppModule.configure()`, não aqui — Nest
    // resolve as dependências dele no injector do módulo que CHAMA
    // `consumer.apply()` (AppModule), não no módulo que o registra como
    // provider. Exportar só a CLASSE do middleware não basta: o token que
    // o construtor injeta (`CHECKOUT_ORDER_RATE_LIMITER`) também precisa
    // estar visível pra quem importa este módulo. Mesmo padrão de
    // `GeoModule` (exporta `GeocodeMiddleware`/`GeocodeIpRateLimitMiddleware`
    // E `GEOCODE_RATE_LIMITER` juntos) — sem isso, boot falha com "Nest
    // can't resolve dependencies of the CheckoutOrderRateLimitMiddleware".
    CHECKOUT_ORDER_RATE_LIMITER,
  ],
})
export class OrdersModule {}
