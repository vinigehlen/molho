import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { RedisRefreshLookupStore } from './refresh-lookup-store';

describe('RedisRefreshLookupStore', () => {
  it('create grava com EX (TTL de 30 dias)', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const redis = { set } as unknown as Redis;
    const store = new RedisRefreshLookupStore(redis);

    await store.create('hash1', 'user-1', 'device-1');

    expect(set).toHaveBeenCalledWith(
      'refresh_lookup:hash1',
      JSON.stringify({ userId: 'user-1', deviceId: 'device-1' }),
      'EX',
      30 * 24 * 60 * 60,
    );
  });

  it('consume usa SET...GET (atômico) e devolve "unknown" se a chave nunca existiu', async () => {
    const set = vi.fn().mockResolvedValue(null);
    const redis = { set } as unknown as Redis;
    const store = new RedisRefreshLookupStore(redis);

    const result = await store.consume('hash-desconhecido');

    expect(result).toEqual({ status: 'unknown' });
    expect(set).toHaveBeenCalledWith(
      'refresh_lookup:hash-desconhecido',
      expect.any(String),
      'EX',
      expect.any(Number),
      'GET',
    );
  });

  it('consume devolve "valid" na 1ª vez e "reused" na 2ª (o valor antigo já vem marcado)', async () => {
    const values = [
      JSON.stringify({ userId: 'user-1', deviceId: 'device-1' }),
      JSON.stringify({ userId: 'user-1', deviceId: 'device-1', reused: true }),
    ];
    const set = vi.fn().mockImplementation(() => Promise.resolve(values.shift() ?? null));
    const redis = { set } as unknown as Redis;
    const store = new RedisRefreshLookupStore(redis);

    expect(await store.consume('hash1')).toEqual({ status: 'valid', userId: 'user-1', deviceId: 'device-1' });
    expect(await store.consume('hash1')).toEqual({
      status: 'reused',
      userId: 'user-1',
      deviceId: 'device-1',
    });
  });

  it('delete remove a chave', async () => {
    const del = vi.fn().mockResolvedValue(1);
    const redis = { del } as unknown as Redis;
    const store = new RedisRefreshLookupStore(redis);

    await store.delete('hash1');
    expect(del).toHaveBeenCalledWith('refresh_lookup:hash1');
  });
});
