import { describe, expect, it, vi } from 'vitest';
import { probeDb, probeRedis } from './readiness.service';

describe('probeDb', () => {
  it('ok quando SELECT 1 resolve', async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    await expect(probeDb(client)).resolves.toBe('ok');
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('fail quando a query rejeita (DB fora)', async () => {
    const client = { $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    await expect(probeDb(client)).resolves.toBe('fail');
  });

  it('fail quando a query passa do timeout', async () => {
    const client = { $queryRawUnsafe: () => new Promise(() => {}) }; // nunca resolve
    await expect(probeDb(client, 20)).resolves.toBe('fail');
  });
});

describe('probeRedis', () => {
  it('ok quando PING responde PONG', async () => {
    await expect(probeRedis({ ping: vi.fn().mockResolvedValue('PONG') })).resolves.toBe('ok');
  });

  it('fail quando PING responde outra coisa', async () => {
    await expect(probeRedis({ ping: vi.fn().mockResolvedValue('LOADING') })).resolves.toBe('fail');
  });

  it('fail quando PING rejeita (Redis fora)', async () => {
    await expect(probeRedis({ ping: vi.fn().mockRejectedValue(new Error('connection lost')) })).resolves.toBe('fail');
  });

  it('fail quando PING passa do timeout', async () => {
    await expect(probeRedis({ ping: () => new Promise(() => {}) }, 20)).resolves.toBe('fail');
  });

  it('skipped quando não há cliente (dev sem REDIS_URL)', async () => {
    await expect(probeRedis(null)).resolves.toBe('skipped');
  });
});
