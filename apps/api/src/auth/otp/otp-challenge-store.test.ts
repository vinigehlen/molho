import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryOtpChallengeStore, RedisOtpChallengeStore } from './otp-challenge-store';

describe('RedisOtpChallengeStore', () => {
  it('create grava HASH (codeHmac + attempts) e seta EXPIRE', async () => {
    const hset = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    const redis = { hset, expire } as unknown as Redis;
    const store = new RedisOtpChallengeStore(redis);

    await store.create('staff', 'hash1', 'abc', 600);

    expect(hset).toHaveBeenCalledWith('otp:staff:hash1', { codeHmac: 'abc', attempts: '0' });
    expect(expire).toHaveBeenCalledWith('otp:staff:hash1', 600);
  });

  it('get devolve null quando a chave não existe (expirou ou nunca existiu)', async () => {
    const redis = { hgetall: vi.fn().mockResolvedValue({}) } as unknown as Redis;
    const store = new RedisOtpChallengeStore(redis);

    expect(await store.get('staff', 'hash1')).toBeNull();
  });

  it('get devolve o desafio quando existe', async () => {
    const redis = {
      hgetall: vi.fn().mockResolvedValue({ codeHmac: 'abc', attempts: '2' }),
    } as unknown as Redis;
    const store = new RedisOtpChallengeStore(redis);

    expect(await store.get('staff', 'hash1')).toEqual({ codeHmac: 'abc', attempts: 2 });
  });

  it('incrementAttempts usa HINCRBY (não mexe no TTL da chave)', async () => {
    const hincrby = vi.fn().mockResolvedValue(1);
    const redis = { hincrby } as unknown as Redis;
    const store = new RedisOtpChallengeStore(redis);

    expect(await store.incrementAttempts('staff', 'hash1')).toBe(1);
    expect(hincrby).toHaveBeenCalledWith('otp:staff:hash1', 'attempts', 1);
  });
});

describe('InMemoryOtpChallengeStore', () => {
  it('expira sozinho depois do TTL', async () => {
    let now = 0;
    const store = new InMemoryOtpChallengeStore(() => now);

    await store.create('staff', 'hash1', 'abc', 600);
    expect(await store.get('staff', 'hash1')).toEqual({ codeHmac: 'abc', attempts: 0 });

    now += 600_000 + 1;
    expect(await store.get('staff', 'hash1')).toBeNull();
  });

  it('scopes diferentes são chaves diferentes', async () => {
    const store = new InMemoryOtpChallengeStore();
    await store.create('staff', 'hash1', 'abc', 600);

    expect(await store.get('customer:x', 'hash1')).toBeNull();
    expect(await store.get('staff', 'hash1')).not.toBeNull();
  });
});
