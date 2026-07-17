import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { ContextModule } from '../../context/context.module';
import { RequestContextService } from '../../context/request-context.service';
import { PrismaCustomerAuthRepository } from './customer-auth-repository';
import { InMemoryRefreshLookupStore, RedisRefreshLookupStore } from './refresh-lookup-store';
import { InMemorySessionStore, RedisSessionStore } from './session-store';
import { loadJwtSecrets } from './token-payload';
import { TokenService } from './token.service';
import type { UserAuthRepository } from './user-version-repository';
import { InMemoryUserVersionCache, RedisUserVersionCache } from './user-version-cache';
import { PrismaUserAuthRepository } from './user-version-repository';

/** Staff (users). */
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
/** Customer (customers) — mesma classe TokenService, repositório diferente. */
export const CUSTOMER_TOKEN_SERVICE = Symbol('CUSTOMER_TOKEN_SERVICE');

function buildTokenService(userRepository: UserAuthRepository): TokenService {
  const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
  return new TokenService({
    jwtSecrets: loadJwtSecrets(),
    userRepository,
    sessionStore: redis ? new RedisSessionStore(redis) : new InMemorySessionStore(),
    refreshLookupStore: redis ? new RedisRefreshLookupStore(redis) : new InMemoryRefreshLookupStore(),
    userVersionCache: redis ? new RedisUserVersionCache(redis) : new InMemoryUserVersionCache(),
  });
}

@Module({
  imports: [ContextModule],
  providers: [
    {
      provide: TOKEN_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): TokenService =>
        buildTokenService(new PrismaUserAuthRepository(requestContext)),
    },
    {
      provide: CUSTOMER_TOKEN_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): TokenService =>
        buildTokenService(new PrismaCustomerAuthRepository(requestContext)),
    },
  ],
  exports: [TOKEN_SERVICE, CUSTOMER_TOKEN_SERVICE],
})
export class TokenModule {}
