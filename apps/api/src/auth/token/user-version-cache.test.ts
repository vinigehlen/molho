import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryUserVersionCache, RedisUserVersionCache } from './user-version-cache';

describe('RedisUserVersionCache', () => {
  it('set grava com EX 60s; get devolve number ou null', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const get = vi.fn().mockResolvedValueOnce('3').mockResolvedValueOnce(null);
    const redis = { set, get } as unknown as Redis;
    const cache = new RedisUserVersionCache(redis);

    await cache.set('user-1', 3);
    expect(set).toHaveBeenCalledWith('user_version:user-1', '3', 'EX', 60);

    expect(await cache.get('user-1')).toBe(3);
    expect(await cache.get('user-1')).toBeNull();
  });

  it('invalidate remove a chave', async () => {
    const del = vi.fn().mockResolvedValue(1);
    const redis = { del } as unknown as Redis;
    const cache = new RedisUserVersionCache(redis);

    await cache.invalidate('user-1');
    expect(del).toHaveBeenCalledWith('user_version:user-1');
  });
});

describe('InMemoryUserVersionCache', () => {
  it('expira sozinho depois de 60s', async () => {
    let now = 0;
    const cache = new InMemoryUserVersionCache(() => now);

    await cache.set('user-1', 3);
    expect(await cache.get('user-1')).toBe(3);

    now += 60_000 + 1;
    expect(await cache.get('user-1')).toBeNull();
  });
});
