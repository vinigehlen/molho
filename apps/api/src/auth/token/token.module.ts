import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { ContextModule } from '../../context/context.module';
import { RequestContextService } from '../../context/request-context.service';
import { InMemoryRefreshLookupStore, RedisRefreshLookupStore } from './refresh-lookup-store';
import { InMemorySessionStore, RedisSessionStore } from './session-store';
import { loadJwtSecrets } from './token-payload';
import { TokenService } from './token.service';
import { InMemoryUserVersionCache, RedisUserVersionCache } from './user-version-cache';
import { PrismaUserAuthRepository } from './user-version-repository';

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

@Module({
  imports: [ContextModule],
  providers: [
    {
      provide: TOKEN_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): TokenService => {
        const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

        return new TokenService({
          jwtSecrets: loadJwtSecrets(),
          userRepository: new PrismaUserAuthRepository(requestContext),
          sessionStore: redis ? new RedisSessionStore(redis) : new InMemorySessionStore(),
          refreshLookupStore: redis
            ? new RedisRefreshLookupStore(redis)
            : new InMemoryRefreshLookupStore(),
          userVersionCache: redis ? new RedisUserVersionCache(redis) : new InMemoryUserVersionCache(),
        });
      },
    },
  ],
  exports: [TOKEN_SERVICE],
})
export class TokenModule {}
