import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryCooldown, RedisCooldown } from './cooldown';

describe('RedisCooldown', () => {
  it('usa SET NX EX — só adquire se a chave ainda não existir', async () => {
    const set = vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const redis = { set } as unknown as Redis;
    const cooldown = new RedisCooldown(redis);

    expect(await cooldown.tryAcquire('k', 60)).toBe(true);
    expect(await cooldown.tryAcquire('k', 60)).toBe(false);
    expect(set).toHaveBeenCalledWith('k', '1', 'EX', 60, 'NX');
  });
});

describe('InMemoryCooldown', () => {
  it('bloqueia até o tempo passar, depois libera de novo', async () => {
    let now = 0;
    const cooldown = new InMemoryCooldown(() => now);

    expect(await cooldown.tryAcquire('k', 60)).toBe(true);
    expect(await cooldown.tryAcquire('k', 60)).toBe(false);

    now += 60_000 + 1;
    expect(await cooldown.tryAcquire('k', 60)).toBe(true);
  });
});
