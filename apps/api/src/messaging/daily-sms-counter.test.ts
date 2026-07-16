import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryDailySmsCounter, RedisDailySmsCounter } from './daily-sms-counter';

describe('InMemoryDailySmsCounter', () => {
  it('incrementa e devolve o total, por chave de data', async () => {
    const counter = new InMemoryDailySmsCounter();
    expect(await counter.incrementAndGet('2026-07-16')).toBe(1);
    expect(await counter.incrementAndGet('2026-07-16')).toBe(2);
    expect(await counter.incrementAndGet('2026-07-17')).toBe(1); // dia diferente, contador zerado
  });
});

describe('RedisDailySmsCounter', () => {
  it('usa INCR (atômico) e seta EXPIRE só na primeira vez', async () => {
    const incr = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const expire = vi.fn().mockResolvedValue(1);
    const fakeRedis = { incr, expire } as unknown as Redis;
    const counter = new RedisDailySmsCounter(fakeRedis);

    expect(await counter.incrementAndGet('2026-07-16')).toBe(1);
    expect(expire).toHaveBeenCalledTimes(1); // só na 1ª (count === 1)

    expect(await counter.incrementAndGet('2026-07-16')).toBe(2);
    expect(expire).toHaveBeenCalledTimes(1); // não repete na 2ª

    expect(incr).toHaveBeenCalledWith('sms_count:2026-07-16');
  });
});
