import { Module } from '@nestjs/common';
import type { ModuleCache } from '@molho/db';
import Redis from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { MODULE_CACHE, ModuleCheckModule } from '../modules/module-check.module';
import {
  InMemorySlidingWindowRateLimiter,
  type RateLimiter,
  RedisSlidingWindowRateLimiter,
} from '../rate-limit/rate-limiter';
import { PrismaAvailablePaymentMethodsResolver } from './available-payment-methods';
import { DeliveryMatchService } from './delivery-match.service';
import { PrismaDeliveryMatchRepository } from './delivery-match.repository';
import { PublicStoreController } from './public-store.controller';
import { PrismaStorefrontRepository } from './storefront.repository';
import { StorefrontService } from './storefront.service';
import { DELIVERY_MATCH_SERVICE, STOREFRONT_RATE_LIMITER, STOREFRONT_SERVICE } from './storefront.tokens';

/**
 * ModuleCheckModule e AuthModule entram aqui porque `RequireModuleGuard` é
 * referenciado por CLASSE em `@UseGuards()` — o Nest o resolve no injector do
 * módulo que declara o controller, não no que o exporta (achado do Épico 4,
 * ver comentário longo em CatalogModule).
 *
 * Não importa `TokenModule`: esta rota não tem `JwtAuthGuard`, é pública.
 */
@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule],
  controllers: [PublicStoreController],
  providers: [
    {
      provide: STOREFRONT_SERVICE,
      inject: [RequestContextService, MODULE_CACHE],
      useFactory: (requestContext: RequestContextService, moduleCache: ModuleCache): StorefrontService =>
        new StorefrontService(
          new PrismaStorefrontRepository(requestContext),
          process.env.S3_PUBLIC_URL,
          new PrismaAvailablePaymentMethodsResolver(requestContext, moduleCache),
        ),
    },
    {
      // Sem REDIS_URL cai no limitador em memória: em dev de uma instância só
      // ele funciona igual. Em produção (várias instâncias) só o Redis conta
      // certo — mesmo padrão de StorageModule e OtpModule.
      provide: STOREFRONT_RATE_LIMITER,
      useFactory: (): RateLimiter => {
        const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
        return redis ? new RedisSlidingWindowRateLimiter(redis) : new InMemorySlidingWindowRateLimiter();
      },
    },
    {
      provide: DELIVERY_MATCH_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): DeliveryMatchService =>
        new DeliveryMatchService(new PrismaDeliveryMatchRepository(requestContext)),
    },
  ],
  // STOREFRONT_RATE_LIMITER exportado além dos dois serviços: o checkout
  // (Épico 7, OrdersModule) reaproveita StorefrontRateLimitGuard na rota
  // pública de revalidação — mesma razão de custo/scraping, chave por
  // (slug+IP) já cobre "preço do cardápio" e "preço revalidado" igual.
  exports: [STOREFRONT_SERVICE, DELIVERY_MATCH_SERVICE, STOREFRONT_RATE_LIMITER],
})
export class StorefrontModule {}
