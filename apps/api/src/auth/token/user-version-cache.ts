import type Redis from 'ioredis';

const TTL_SECONDS = 60;

/** Evita bater no Postgres em todo verifyAccessToken — cache curto de propósito. */
export interface UserVersionCache {
  get(userId: string): Promise<number | null>;
  set(userId: string, version: number): Promise<void>;
  invalidate(userId: string): Promise<void>;
}

function key(userId: string): string {
  return `user_version:${userId}`;
}

export class RedisUserVersionCache implements UserVersionCache {
  constructor(private readonly redis: Redis) {}

  async get(userId: string): Promise<number | null> {
    const raw = await this.redis.get(key(userId));
    return raw === null ? null : Number(raw);
  }

  async set(userId: string, version: number): Promise<void> {
    await this.redis.set(key(userId), String(version), 'EX', TTL_SECONDS);
  }

  async invalidate(userId: string): Promise<void> {
    await this.redis.del(key(userId));
  }
}

interface Entry {
  version: number;
  expiresAt: number;
}

export class InMemoryUserVersionCache implements UserVersionCache {
  private readonly store = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(userId: string): Promise<number | null> {
    const entry = this.store.get(userId);
    if (!entry || entry.expiresAt <= this.now()) {
      this.store.delete(userId);
      return null;
    }
    return entry.version;
  }

  async set(userId: string, version: number): Promise<void> {
    this.store.set(userId, { version, expiresAt: this.now() + TTL_SECONDS * 1000 });
  }

  async invalidate(userId: string): Promise<void> {
    this.store.delete(userId);
  }
}
