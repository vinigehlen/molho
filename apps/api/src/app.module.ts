import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ContextModule } from './context/context.module';
import { CouponsModule } from './coupons/coupons.module';
import { CustomerProfileModule } from './customer-profile/customer-profile.module';
import { DeliveryZoneAdminModule } from './delivery-zones/delivery-zone.module';
import { GeoModule } from './geo/geo.module';
import { GeocodeIpRateLimitMiddleware, GeocodeMiddleware } from './geo/geocode.middleware';
import { HealthController } from './health/health.controller';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { MessagingModule } from './messaging/messaging.module';
import { CheckoutOrderRateLimitMiddleware } from './orders/checkout-order-rate-limit.middleware';
import { OrdersModule } from './orders/orders.module';
import { PlatformModule } from './platform/platform.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SchedulingSlotAdminModule } from './scheduling-slots/scheduling-slot-admin.module';
import { SignupModule } from './signup/signup.module';
import { StoreHoursAdminModule } from './store-hours-admin/store-hours-admin.module';
import { StoreSetupModule } from './store-setup/store-setup.module';
import { StorefrontModule } from './storefront/storefront.module';
import { StorefrontRateLimitMiddleware } from './storefront/storefront-rate-limit.middleware';

@Module({
  imports: [
    ContextModule,
    MessagingModule,
    AuthModule,
    CustomerProfileModule,
    CatalogModule,
    CouponsModule,
    StorefrontModule,
    OrdersModule,
    GeoModule,
    DeliveryZoneAdminModule,
    StoreHoursAdminModule,
    StoreSetupModule,
    SchedulingSlotAdminModule,
    PlatformModule,
    LoyaltyModule,
    ReviewsModule,
    SignupModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  /**
   * As três rotas que resolvem endereço a partir de CEP (Épico 6, Bloco 2).
   *
   * MIDDLEWARE, não Guard/Interceptor: `TenantContextInterceptor` abre a
   * transação de request (que fixa uma conexão do pool) em volta do handler
   * inteiro, então geocodar lá dentro seguraria a conexão durante 2–5s de
   * HTTP externo — P2028 sob carga, e `/checkout/revalidate` é público e
   * pré-OTP (CLAUDE.md § Contexto de request).
   *
   * A ORDEM do `apply()` é a ordem de execução, e importa: o cap por IP vem
   * ANTES do geocode, senão o bot já pagou a chamada externa antes de ser
   * barrado. É também por isso que o cap não é um `CanActivate` — Guards
   * rodam depois de todo middleware.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(StorefrontRateLimitMiddleware)
      .forRoutes({ path: 'v1/store/:slug/track/:token', method: RequestMethod.GET });

    // ANTES do bloco de geocode, e por isso num `apply()` próprio: o cap de
    // criação de pedido tem que barrar o bot antes de ele custar uma chamada
    // externa. `checkout.guest` (CLAUDE.md regra 13, EMENDA) torna esta rota
    // uma ESCRITA PÚBLICA — ver checkout-order-rate-limit.middleware.ts.
    consumer
      .apply(CheckoutOrderRateLimitMiddleware)
      .forRoutes({ path: 'v1/store/:slug/checkout/orders', method: RequestMethod.POST });

    consumer.apply(GeocodeIpRateLimitMiddleware, GeocodeMiddleware).forRoutes(
      { path: 'v1/store/:slug/delivery-match', method: RequestMethod.POST },
      { path: 'v1/store/:slug/checkout/revalidate', method: RequestMethod.POST },
      { path: 'v1/store/:slug/checkout/orders', method: RequestMethod.POST },
      { path: 'v1/admin/stores/:storeId/setup', method: RequestMethod.PUT },
    );
  }
}
