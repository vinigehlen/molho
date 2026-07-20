import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import {
  InMemorySlidingWindowRateLimiter,
  type RateLimiter,
  RedisSlidingWindowRateLimiter,
} from '../rate-limit/rate-limiter';
import { PublicStoreController } from './public-store.controller';
import { PrismaStorefrontRepository } from './storefront.repository';
import { StorefrontService } from './storefront.service';
import { STOREFRONT_RATE_LIMITER, STOREFRONT_SERVICE } from './storefront.tokens';

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
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): StorefrontService =>
        new StorefrontService(new PrismaStorefrontRepository(requestContext), process.env.S3_PUBLIC_URL),
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
  ],
  exports: [STOREFRONT_SERVICE],
})
export class StorefrontModule {}
