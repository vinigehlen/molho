import { HttpException, type ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemorySlidingWindowRateLimiter } from '../rate-limit/rate-limiter';
import { STOREFRONT_RATE_LIMIT, StorefrontRateLimitGuard } from './storefront-rate-limit.guard';

function contextoDe(slug: string, ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params: { slug }, ip }) }),
  } as unknown as ExecutionContext;
}

describe('StorefrontRateLimitGuard', () => {
  let guard: StorefrontRateLimitGuard;

  beforeEach(() => {
    guard = new StorefrontRateLimitGuard(new InMemorySlidingWindowRateLimiter());
  });

  it('deixa passar dentro do limite', async () => {
    for (let i = 0; i < STOREFRONT_RATE_LIMIT; i++) {
      await expect(guard.canActivate(contextoDe('hamburgueria-da-vila', '1.1.1.1'))).resolves.toBe(true);
    }
  });

  it('responde 429 ao estourar o limite', async () => {
    for (let i = 0; i < STOREFRONT_RATE_LIMIT; i++) {
      await guard.canActivate(contextoDe('hamburgueria-da-vila', '1.1.1.1'));
    }

    await expect(guard.canActivate(contextoDe('hamburgueria-da-vila', '1.1.1.1'))).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('conta por LOJA: estourar numa não derruba a outra (chave é slug+IP)', async () => {
    for (let i = 0; i <= STOREFRONT_RATE_LIMIT; i++) {
      await guard.canActivate(contextoDe('hamburgueria-da-vila', '1.1.1.1')).catch(() => undefined);
    }

    await expect(guard.canActivate(contextoDe('pizzaria-roma', '1.1.1.1'))).resolves.toBe(true);
  });

  it('conta por IP: um cliente abusivo não derruba os outros da mesma loja', async () => {
    for (let i = 0; i <= STOREFRONT_RATE_LIMIT; i++) {
      await guard.canActivate(contextoDe('hamburgueria-da-vila', '1.1.1.1')).catch(() => undefined);
    }

    await expect(guard.canActivate(contextoDe('hamburgueria-da-vila', '2.2.2.2'))).resolves.toBe(true);
  });
});
