import type Redis from 'ioredis';
import type { DeviceInfo } from './token-payload';

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias, sliding

export interface SessionRecord {
  refreshHash: string;
  tokenVersion: number;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string;
  ipAtCreate: string;
  ipAtLastUse: string;
}

/**
 * Metadado do dispositivo (session:{userId}:{deviceId}) — userAgent/IP são
 * só referência humana pra "meus dispositivos" (Épico 3, commit dos
 * guards/sessions), nunca usados pra decisão de segurança. user_sessions
 * é o índice pra enumerar todos os devices de um user sem SCAN.
 */
export interface SessionStore {
  create(userId: string, deviceId: string, refreshHash: string, tokenVersion: number, device: DeviceInfo): Promise<void>;
  get(userId: string, deviceId: string): Promise<SessionRecord | null>;
  touch(userId: string, deviceId: string, refreshHash: string, ip: string): Promise<void>;
  delete(userId: string, deviceId: string): Promise<void>;
  listDeviceIds(userId: string): Promise<string[]>;
}

function sessionKey(userId: string, deviceId: string): string {
  return `session:${userId}:${deviceId}`;
}
function indexKey(userId: string): string {
  return `user_sessions:${userId}`;
}

export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: Redis) {}

  async create(
    userId: string,
    deviceId: string,
    refreshHash: string,
    tokenVersion: number,
    device: DeviceInfo,
  ): Promise<void> {
    const now = new Date().toISOString();
    const key = sessionKey(userId, deviceId);
    await this.redis.hset(key, {
      refreshHash,
      tokenVersion: String(tokenVersion),
      createdAt: now,
      lastUsedAt: now,
      userAgent: device.userAgent ?? '',
      ipAtCreate: device.ip,
      ipAtLastUse: device.ip,
    });
    await this.redis.expire(key, SESSION_TTL_SECONDS);
    await this.redis.sadd(indexKey(userId), deviceId);
  }

  async get(userId: string, deviceId: string): Promise<SessionRecord | null> {
    const data = await this.redis.hgetall(sessionKey(userId, deviceId));
    if (!data.refreshHash) return null;
    return {
      refreshHash: data.refreshHash,
      tokenVersion: Number(data.tokenVersion ?? 0),
      createdAt: data.createdAt ?? '',
      lastUsedAt: data.lastUsedAt ?? '',
      userAgent: data.userAgent ?? '',
      ipAtCreate: data.ipAtCreate ?? '',
      ipAtLastUse: data.ipAtLastUse ?? '',
    };
  }

  /** Chamado a cada rotação bem-sucedida — é o que dá o TTL deslizante. */
  async touch(userId: string, deviceId: string, refreshHash: string, ip: string): Promise<void> {
    const key = sessionKey(userId, deviceId);
    await this.redis.hset(key, {
      refreshHash,
      lastUsedAt: new Date().toISOString(),
      ipAtLastUse: ip,
    });
    await this.redis.expire(key, SESSION_TTL_SECONDS);
  }

  async delete(userId: string, deviceId: string): Promise<void> {
    await this.redis.del(sessionKey(userId, deviceId));
    await this.redis.srem(indexKey(userId), deviceId);
  }

  async listDeviceIds(userId: string): Promise<string[]> {
    return this.redis.smembers(indexKey(userId));
  }
}

interface InMemoryRecord extends SessionRecord {
  expiresAt: number;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, InMemoryRecord>();
  private readonly index = new Map<string, Set<string>>();

  constructor(private readonly now: () => number = Date.now) {}

  async create(
    userId: string,
    deviceId: string,
    refreshHash: string,
    tokenVersion: number,
    device: DeviceInfo,
  ): Promise<void> {
    const now = new Date(this.now()).toISOString();
    this.sessions.set(sessionKey(userId, deviceId), {
      refreshHash,
      tokenVersion,
      createdAt: now,
      lastUsedAt: now,
      userAgent: device.userAgent ?? '',
      ipAtCreate: device.ip,
      ipAtLastUse: device.ip,
      expiresAt: this.now() + SESSION_TTL_SECONDS * 1000,
    });
    const set = this.index.get(userId) ?? new Set<string>();
    set.add(deviceId);
    this.index.set(userId, set);
  }

  async get(userId: string, deviceId: string): Promise<SessionRecord | null> {
    const key = sessionKey(userId, deviceId);
    const record = this.sessions.get(key);
    if (!record) return null;
    if (record.expiresAt <= this.now()) {
      this.sessions.delete(key);
      this.index.get(userId)?.delete(deviceId);
      return null;
    }
    return record;
  }

  /** Sliding TTL: cada touch() bem-sucedido renova os 30 dias inteiros. */
  async touch(userId: string, deviceId: string, refreshHash: string, ip: string): Promise<void> {
    const existing = this.sessions.get(sessionKey(userId, deviceId));
    if (!existing) return;
    existing.refreshHash = refreshHash;
    existing.lastUsedAt = new Date(this.now()).toISOString();
    existing.ipAtLastUse = ip;
    existing.expiresAt = this.now() + SESSION_TTL_SECONDS * 1000;
  }

  async delete(userId: string, deviceId: string): Promise<void> {
    this.sessions.delete(sessionKey(userId, deviceId));
    this.index.get(userId)?.delete(deviceId);
  }

  async listDeviceIds(userId: string): Promise<string[]> {
    return [...(this.index.get(userId) ?? [])];
  }
}
