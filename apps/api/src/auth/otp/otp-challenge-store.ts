import type Redis from 'ioredis';

export interface OtpChallenge {
  codeHmac: string;
  attempts: number;
}

/**
 * O desafio ativo (HMAC do código + tentativas de verificação) por
 * (scope, phoneHash). Nunca guarda o código em claro. `incrementAttempts`
 * precisa preservar o TTL da chave — por isso HASH (HINCRBY não mexe no
 * TTL), não uma string JSON que precisaria reescrever a chave inteira.
 */
export interface OtpChallengeStore {
  create(scope: string, phoneHash: string, codeHmac: string, ttlSeconds: number): Promise<void>;
  get(scope: string, phoneHash: string): Promise<OtpChallenge | null>;
  incrementAttempts(scope: string, phoneHash: string): Promise<number>;
  delete(scope: string, phoneHash: string): Promise<void>;
}

function redisKey(scope: string, phoneHash: string): string {
  return `otp:${scope}:${phoneHash}`;
}

export class RedisOtpChallengeStore implements OtpChallengeStore {
  constructor(private readonly redis: Redis) {}

  async create(scope: string, phoneHash: string, codeHmac: string, ttlSeconds: number): Promise<void> {
    const key = redisKey(scope, phoneHash);
    await this.redis.hset(key, { codeHmac, attempts: '0' });
    await this.redis.expire(key, ttlSeconds);
  }

  async get(scope: string, phoneHash: string): Promise<OtpChallenge | null> {
    const data = await this.redis.hgetall(redisKey(scope, phoneHash));
    if (!data.codeHmac) return null;
    return { codeHmac: data.codeHmac, attempts: Number(data.attempts ?? 0) };
  }

  async incrementAttempts(scope: string, phoneHash: string): Promise<number> {
    return this.redis.hincrby(redisKey(scope, phoneHash), 'attempts', 1);
  }

  async delete(scope: string, phoneHash: string): Promise<void> {
    await this.redis.del(redisKey(scope, phoneHash));
  }
}

interface InMemoryEntry extends OtpChallenge {
  expiresAt: number;
}

export class InMemoryOtpChallengeStore implements OtpChallengeStore {
  private readonly store = new Map<string, InMemoryEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  async create(scope: string, phoneHash: string, codeHmac: string, ttlSeconds: number): Promise<void> {
    this.store.set(redisKey(scope, phoneHash), {
      codeHmac,
      attempts: 0,
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }

  async get(scope: string, phoneHash: string): Promise<OtpChallenge | null> {
    const entry = this.store.get(redisKey(scope, phoneHash));
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(redisKey(scope, phoneHash));
      return null;
    }
    return { codeHmac: entry.codeHmac, attempts: entry.attempts };
  }

  async incrementAttempts(scope: string, phoneHash: string): Promise<number> {
    const key = redisKey(scope, phoneHash);
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.attempts += 1;
    return entry.attempts;
  }

  async delete(scope: string, phoneHash: string): Promise<void> {
    this.store.delete(redisKey(scope, phoneHash));
  }
}
