import { Module } from '@nestjs/common';
import { type ModuleCache, RedisModuleCache, noopModuleCache } from '@molho/db';
import Redis from 'ioredis';

export const MODULE_CACHE = Symbol('MODULE_CACHE');

/**
 * Só a camada de cache (Redis, TTL curto) é singleton de verdade — mesmo
 * padrão de TokenModule. `ModuleService`/`PrismaModuleDataSource` em si NÃO
 * são providers aqui: `PrismaModuleDataSource` precisa do client
 * TRANSACIONAL do request (RequestContextService.getClient()), que só
 * existe depois que um guard/interceptor abre `.run()` — por isso
 * RequireModuleGuard constrói os dois por request, não no bootstrap do
 * Nest. Ver require-module.guard.ts.
 */
@Module({
  providers: [
    {
      provide: MODULE_CACHE,
      useFactory: (): ModuleCache => {
        const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
        return redis ? new RedisModuleCache(redis) : noopModuleCache;
      },
    },
  ],
  exports: [MODULE_CACHE],
})
export class ModuleCheckModule {}
