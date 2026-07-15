import type Redis from 'ioredis';
import type { ModuleLogger } from './module-logger';

/**
 * Camada Redis do cache de módulo (TTL curto). Get/set NUNCA lançam — Redis é
 * otimização, banco é fonte da verdade; se Redis cair, o chamador deve seguir
 * como se fosse cache-miss, não quebrar. Ver RedisModuleCache.
 */
export interface ModuleCache {
  get(key: string): Promise<boolean | null>;
  set(key: string, value: boolean, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** Usado quando Redis não está configurado (ex.: dev sem Upstash) — sempre miss. */
export const noopModuleCache: ModuleCache = {
  async get() {
    return null;
  },
  async set() {
    // nada — sem Redis, o request-cache de ModuleService ainda evita N queries.
  },
  async del() {
    // nada.
  },
};

export class RedisModuleCache implements ModuleCache {
  constructor(
    private readonly redis: Redis,
    private readonly logger: ModuleLogger = { warn: () => {} },
  ) {}

  async get(key: string): Promise<boolean | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return raw === '1';
    } catch (error) {
      this.logger.warn('redis_down_falling_back_to_db', { key, error: String(error) });
      return null;
    }
  }

  async set(key: string, value: boolean, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value ? '1' : '0', 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn('redis_down_falling_back_to_db', { key, error: String(error) });
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn('redis_down_falling_back_to_db', { key, error: String(error) });
    }
  }
}
