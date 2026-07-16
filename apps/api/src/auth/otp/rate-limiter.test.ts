import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { InMemorySlidingWindowRateLimiter, RedisSlidingWindowRateLimiter } from './rate-limiter';

describe('RedisSlidingWindowRateLimiter', () => {
  it('usa MULTI (zremrangebyscore + zadd + zcard + expire) e compara ZCARD com o limite', async () => {
    const multi = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 3], // ZCARD: 3 dentro da janela
        [null, 1],
      ]),
    };
    const redis = { multi: () => multi } as unknown as Redis;
    const limiter = new RedisSlidingWindowRateLimiter(redis);

    expect(await limiter.checkAndRecord('k', 5, 3600)).toBe(true); // 3 <= 5
    expect(multi.zremrangebyscore).toHaveBeenCalled();
    expect(multi.zadd).toHaveBeenCalled();
    expect(multi.expire).toHaveBeenCalledWith('k', 3600);
  });

  it('ZCARD acima do limite bloqueia', async () => {
    const multi = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 6],
        [null, 1],
      ]),
    };
    const redis = { multi: () => multi } as unknown as Redis;
    const limiter = new RedisSlidingWindowRateLimiter(redis);

    expect(await limiter.checkAndRecord('k', 5, 3600)).toBe(false); // 6 > 5
  });
});

describe('InMemorySlidingWindowRateLimiter', () => {
  it('janela desliza de verdade: hits antigos saem da contagem', async () => {
    let now = 0;
    const limiter = new InMemorySlidingWindowRateLimiter(() => now);

    for (let i = 0; i < 5; i++) expect(await limiter.checkAndRecord('k', 5, 3600)).toBe(true);
    expect(await limiter.checkAndRecord('k', 5, 3600)).toBe(false); // 6º estoura

    now += 3600 * 1000 + 1; // passa da janela inteira
    expect(await limiter.checkAndRecord('k', 5, 3600)).toBe(true); // reconta do zero
  });
});
