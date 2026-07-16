import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { RedisSessionStore } from './session-store';

describe('RedisSessionStore', () => {
  it('create grava HASH, seta EXPIRE e indexa o deviceId em user_sessions', async () => {
    const hset = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    const sadd = vi.fn().mockResolvedValue(1);
    const redis = { hset, expire, sadd } as unknown as Redis;
    const store = new RedisSessionStore(redis);

    await store.create('user-1', 'device-1', 'hash1', 0, { ip: '1.2.3.4', userAgent: 'ua' });

    expect(hset).toHaveBeenCalledWith(
      'session:user-1:device-1',
      expect.objectContaining({ refreshHash: 'hash1', ipAtCreate: '1.2.3.4', ipAtLastUse: '1.2.3.4' }),
    );
    expect(expire).toHaveBeenCalledWith('session:user-1:device-1', 30 * 24 * 60 * 60);
    expect(sadd).toHaveBeenCalledWith('user_sessions:user-1', 'device-1');
  });

  it('get devolve null quando a HASH está vazia', async () => {
    const redis = { hgetall: vi.fn().mockResolvedValue({}) } as unknown as Redis;
    const store = new RedisSessionStore(redis);

    expect(await store.get('user-1', 'device-1')).toBeNull();
  });

  it('delete remove a HASH e desindexa o deviceId', async () => {
    const del = vi.fn().mockResolvedValue(1);
    const srem = vi.fn().mockResolvedValue(1);
    const redis = { del, srem } as unknown as Redis;
    const store = new RedisSessionStore(redis);

    await store.delete('user-1', 'device-1');
    expect(del).toHaveBeenCalledWith('session:user-1:device-1');
    expect(srem).toHaveBeenCalledWith('user_sessions:user-1', 'device-1');
  });

  it('listDeviceIds lê do índice (SMEMBERS), não faz SCAN', async () => {
    const smembers = vi.fn().mockResolvedValue(['device-1', 'device-2']);
    const redis = { smembers } as unknown as Redis;
    const store = new RedisSessionStore(redis);

    expect(await store.listDeviceIds('user-1')).toEqual(['device-1', 'device-2']);
    expect(smembers).toHaveBeenCalledWith('user_sessions:user-1');
  });

  it('touch renova o EXPIRE (é o que sustenta o TTL deslizante)', async () => {
    const hset = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    const redis = { hset, expire } as unknown as Redis;
    const store = new RedisSessionStore(redis);

    await store.touch('user-1', 'device-1', 'hash-novo', '5.6.7.8');

    expect(hset).toHaveBeenCalledWith(
      'session:user-1:device-1',
      expect.objectContaining({ refreshHash: 'hash-novo', ipAtLastUse: '5.6.7.8' }),
    );
    expect(expire).toHaveBeenCalledWith('session:user-1:device-1', 30 * 24 * 60 * 60);
  });
});
