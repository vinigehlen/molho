import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { PRISMA_CLIENT } from '../context/prisma.token';

/**
 * `/ready` (readiness) — diferente de `/health` (liveness). `/health` responde
 * estático e prova só que o processo está vivo; `/ready` toca banco e Redis e
 * responde não-2xx se uma dependência obrigatória está fora, pro Fly TIRAR a
 * máquina da rotação sem matar o processo. Ver `docs/14` § NG-07.
 *
 * NÃO usa `RequestContextService` nem abre transação com `app.tenant_id` — não
 * é request path. Usa o `PrismaClient` global (exceção legítima, igual ao
 * `context.module.ts`), com timeout curto pra não segurar conexão do pool.
 */

/** Mínimo que a checagem precisa do client — evita importar `PrismaClient` (lint). */
interface RawQueryClient {
  $queryRawUnsafe(query: string): Promise<unknown>;
}

interface Pinger {
  ping(): Promise<string>;
}

export type DependencyStatus = 'ok' | 'fail' | 'skipped';

export interface ReadinessResult {
  ready: boolean;
  db: DependencyStatus;
  redis: DependencyStatus;
}

const CHECK_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
      // não segura o event loop se for a única coisa pendente
      (timer as unknown as { unref?: () => void }).unref?.();
    }),
  ]);
}

/** Pura e testável: roda `SELECT 1` com teto de tempo. */
export async function probeDb(client: RawQueryClient, timeoutMs = CHECK_TIMEOUT_MS): Promise<DependencyStatus> {
  try {
    await withTimeout(client.$queryRawUnsafe('SELECT 1'), timeoutMs);
    return 'ok';
  } catch {
    return 'fail';
  }
}

/** Pura e testável: `PING` com teto de tempo. `null` (sem REDIS_URL) = dev, não bloqueia. */
export async function probeRedis(pinger: Pinger | null, timeoutMs = CHECK_TIMEOUT_MS): Promise<DependencyStatus> {
  if (!pinger) {
    return 'skipped';
  }
  try {
    const pong = await withTimeout(pinger.ping(), timeoutMs);
    return pong === 'PONG' ? 'ok' : 'fail';
  } catch {
    return 'fail';
  }
}

@Injectable()
export class ReadinessService implements OnModuleDestroy {
  private readonly logger = new Logger('ReadinessService');
  private redis: Redis | null = null;

  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: RawQueryClient) {}

  /** Cliente Redis dedicado à readiness, criado uma vez e reusado. */
  private getRedis(): Redis | null {
    const url = process.env.REDIS_URL;
    if (!url) {
      return null; // dev sem Redis; NG-05 garante REDIS_URL em produção
    }
    if (!this.redis) {
      this.redis = new Redis(url, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: CHECK_TIMEOUT_MS,
        commandTimeout: CHECK_TIMEOUT_MS,
      });
      this.redis.on('error', (err) => this.logger.warn(`cliente Redis de readiness: ${err.message}`));
    }
    return this.redis;
  }

  async check(): Promise<ReadinessResult> {
    const [db, redis] = await Promise.all([probeDb(this.prisma), probeRedis(this.getRedis())]);
    if (db !== 'ok') {
      this.logger.warn(`readiness: DB ${db}`);
    }
    if (redis === 'fail') {
      this.logger.warn('readiness: Redis fail');
    }
    return { ready: db === 'ok' && redis !== 'fail', db, redis };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
      this.redis = null;
    }
  }
}
