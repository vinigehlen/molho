/**
 * Geocoding server-side (Épico 6, Mundo A) — o cliente NUNCA fornece
 * lat/lng: ele digita CEP + número e o servidor deriva o ponto.
 *
 * INVARIANTE CRÍTICA: nenhuma implementação disto pode ser chamada de dentro
 * de um `RequestContextService.run()` — são 2–5s de HTTP externo segurando
 * uma conexão do pool do Postgres. Ver `geocode.middleware.ts` e CLAUDE.md
 * § "HTTP externo nunca dentro da transação de request".
 */

/** `number` entra só na consulta estruturada; `null` = "s/n". */
export interface GeocodeInput {
  postalCode: string;
  number: string | null;
}

/**
 * `address` = o geocoder achou o endereço; `postal_centroid` = achou só o
 * CEP (fallback); `unverified` = sem ponto nenhum — checkout barra com 422
 * (decisão de PM: caminho manual de "zona pendente" fica pra Fase 3).
 */
export type GeoPrecision = 'address' | 'postal_centroid' | 'unverified';

export interface GeocodedAddress {
  /** Vindos do ViaCEP. `null` quando ele não respondeu — o chamador cai no texto que o cliente digitou. */
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  /** `null` sse `precision === 'unverified'`. */
  lat: number | null;
  lng: number | null;
  precision: GeoPrecision;
  /**
   * Distingue as duas causas de `unverified` pra cópia do 422 e pro log de
   * frequência do piloto: CEP que não existe vs. CEP válido que nenhum
   * geocoder localizou.
   */
  postalCodeFound: boolean;
}

export interface Geocoder {
  resolve(input: GeocodeInput): Promise<GeocodedAddress>;
}

export const GEOCODER = Symbol('GEOCODER');

/**
 * Cache de CEP. `Address.geo` NÃO serve aqui: `/checkout/revalidate` e
 * `/delivery-match` são públicos e pré-OTP — não existe linha em `addresses`
 * ainda. Sem este cache, cada revalidação bate no OSM e estoura o ToS
 * sozinha.
 */
export interface GeoCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** Mesmo padrão do rate limiter: sem REDIS_URL, memória local (dev de uma instância só). */
export class InMemoryGeoCache implements GeoCache {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }
}

export class RedisGeoCache implements GeoCache {
  constructor(private readonly redis: { get(key: string): Promise<string | null>; set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown> }) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }
}
