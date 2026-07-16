import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

/**
 * Sliding window de verdade (não fixed window) — registra o timestamp de
 * cada tentativa num sorted set e conta quantas caem na janela dos últimos
 * N segundos. increment-then-check: a tentativa que estoura o limite ainda
 * fica registrada (mesmo padrão do DailySmsCounter) — não é boundary de
 * segurança crítica a ponto de valer a pena uma transação mais cara.
 */
export interface RateLimiter {
  /** true = dentro do limite (pode prosseguir); false = estourou. */
  checkAndRecord(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export class RedisSlidingWindowRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async checkAndRecord(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    const multi = this.redis.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now, `${now}:${randomUUID()}`);
    multi.zcard(key);
    multi.expire(key, windowSeconds);
    const results = await multi.exec();

    const countResult = results?.[2];
    const count = (countResult?.[1] as number) ?? 0;
    return count <= limit;
  }
}

export class InMemorySlidingWindowRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  async checkAndRecord(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = this.now();
    const windowStart = now - windowSeconds * 1000;
    const existing = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    existing.push(now);
    this.hits.set(key, existing);
    return existing.length <= limit;
  }
}
