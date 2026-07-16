import type Redis from 'ioredis';

const TTL_SECONDS = 2 * 24 * 60 * 60; // 2 dias — margem de sobra, a chave já muda por dia

/**
 * Guardrail de custo (não é rate limit de segurança — esse é por
 * telefone/IP no otp.service). Um SMS custa ~R$ 0,15; sem teto, um
 * atacante que furasse o rate limit ainda causaria prejuízo financeiro
 * direto. `incrementAndGet` é atômico (INCR do Redis) — increment-then-check,
 * não get-then-increment, pra não ter race entre requests concorrentes.
 */
export interface DailySmsCounter {
  /** Incrementa o contador do dia (chave YYYY-MM-DD) e devolve o total. */
  incrementAndGet(dateKey: string): Promise<number>;
}

export class RedisDailySmsCounter implements DailySmsCounter {
  constructor(private readonly redis: Redis) {}

  async incrementAndGet(dateKey: string): Promise<number> {
    const key = `sms_count:${dateKey}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, TTL_SECONDS);
    }
    return count;
  }
}

/** Pra dev/teste sem Redis — conta em memória, não sobrevive a restart. */
export class InMemoryDailySmsCounter implements DailySmsCounter {
  private readonly counts = new Map<string, number>();

  async incrementAndGet(dateKey: string): Promise<number> {
    const next = (this.counts.get(dateKey) ?? 0) + 1;
    this.counts.set(dateKey, next);
    return next;
  }
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
