import type Redis from 'ioredis';

const TTL_SECONDS = 30 * 24 * 60 * 60; // mesmo TTL deslizante da sessão

const CONSUME_REFRESH_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then
  return nil
end

local value = cjson.decode(current)
value.reused = true
redis.call('SET', KEYS[1], cjson.encode(value), 'EX', ARGV[1])
return current
`;

interface LookupValue {
  userId: string;
  deviceId: string;
  reused?: true;
}

export type RefreshLookupResult =
  | { status: 'valid'; userId: string; deviceId: string }
  | { status: 'reused'; userId: string; deviceId: string }
  | { status: 'unknown' };

/**
 * Índice reverso hash(refresh)->sessão + detecção de reuso. O refresh token
 * em si fica opaco (não carrega userId/deviceId embutido) — é só um blob
 * aleatório; é este índice que resolve "de quem é esse refresh".
 *
 * `consume` é ATÔMICO via script Lua no Redis, que lê o valor atual, preserva
 * a identidade e grava o tombstone na mesma execução — sem isso, duas
 * chamadas concorrentes com o mesmo refresh teriam uma janela de corrida
 * entre "ler se já foi usado" e "marcar como usado". O valor antigo devolvido
 * já diz se essa chamada é a legítima (1ª) ou o reuso (2ª+) — nos dois casos
 * dá pra saber de quem é a sessão, porque o valor carrega sempre
 * userId/deviceId, mesmo depois de marcado `reused`.
 */
export interface RefreshLookupStore {
  create(refreshHash: string, userId: string, deviceId: string): Promise<void>;
  /** Lê e IMEDIATAMENTE marca como consumido — atômico. */
  consume(refreshHash: string): Promise<RefreshLookupResult>;
  delete(refreshHash: string): Promise<void>;
}

function key(refreshHash: string): string {
  return `refresh_lookup:${refreshHash}`;
}

export class RedisRefreshLookupStore implements RefreshLookupStore {
  constructor(private readonly redis: Redis) {}

  async create(refreshHash: string, userId: string, deviceId: string): Promise<void> {
    const value: LookupValue = { userId, deviceId };
    await this.redis.set(key(refreshHash), JSON.stringify(value), 'EX', TTL_SECONDS);
  }

  async consume(refreshHash: string): Promise<RefreshLookupResult> {
    const raw = (await this.redis.eval(
      CONSUME_REFRESH_SCRIPT,
      1,
      key(refreshHash),
      TTL_SECONDS,
    )) as string | null;
    if (raw === null) return { status: 'unknown' };

    const previous = JSON.parse(raw) as LookupValue;
    if (previous.reused) return { status: 'reused', userId: previous.userId, deviceId: previous.deviceId };
    return { status: 'valid', userId: previous.userId, deviceId: previous.deviceId };
  }

  async delete(refreshHash: string): Promise<void> {
    await this.redis.del(key(refreshHash));
  }
}

interface InMemoryEntry extends LookupValue {
  expiresAt: number;
}

export class InMemoryRefreshLookupStore implements RefreshLookupStore {
  private readonly store = new Map<string, InMemoryEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  async create(refreshHash: string, userId: string, deviceId: string): Promise<void> {
    this.store.set(refreshHash, { userId, deviceId, expiresAt: this.now() + TTL_SECONDS * 1000 });
  }

  async consume(refreshHash: string): Promise<RefreshLookupResult> {
    const previous = this.store.get(refreshHash);
    if (!previous || previous.expiresAt <= this.now()) {
      this.store.delete(refreshHash);
      return { status: 'unknown' };
    }

    // Sem `await` entre ler e escrever — atômico dentro do event loop único
    // do Node, mesma garantia que o SET...GET dá no Redis.
    this.store.set(refreshHash, {
      userId: previous.userId,
      deviceId: previous.deviceId,
      reused: true,
      expiresAt: this.now() + TTL_SECONDS * 1000,
    });

    if (previous.reused) return { status: 'reused', userId: previous.userId, deviceId: previous.deviceId };
    return { status: 'valid', userId: previous.userId, deviceId: previous.deviceId };
  }

  async delete(refreshHash: string): Promise<void> {
    this.store.delete(refreshHash);
  }
}
