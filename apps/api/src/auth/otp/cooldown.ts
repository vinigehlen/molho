import type Redis from 'ioredis';

/** Cooldown simples (não sliding window): 1 pedido a cada N segundos. */
export interface Cooldown {
  /** true = não estava em cooldown, pode prosseguir (e já marca o início). */
  tryAcquire(key: string, seconds: number): Promise<boolean>;
}

export class RedisCooldown implements Cooldown {
  constructor(private readonly redis: Redis) {}

  async tryAcquire(key: string, seconds: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', seconds, 'NX');
    return result === 'OK';
  }
}

export class InMemoryCooldown implements Cooldown {
  private readonly until = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  async tryAcquire(key: string, seconds: number): Promise<boolean> {
    const now = this.now();
    const activeUntil = this.until.get(key);
    if (activeUntil !== undefined && activeUntil > now) return false;
    this.until.set(key, now + seconds * 1000);
    return true;
  }
}
