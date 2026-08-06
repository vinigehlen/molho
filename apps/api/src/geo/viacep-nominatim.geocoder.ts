import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { normalizePostalCode } from '@molho/contracts';
import type { RateLimiter } from '../rate-limit/rate-limiter';
import type { GeoCache, GeocodeInput, GeocodedAddress, Geocoder } from './geocoder';

const VIACEP_BASE = 'https://viacep.com.br/ws';
const NOMINATIM_BASE = process.env.MOLHO_NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org/search';
/** ToS do Nominatim exige identificação real de quem chama. */
const USER_AGENT = 'Molho/1.0 (+https://molho.live; contato@molho.live)';
const TIMEOUT_MS = 2_000;
const CACHE_TTL_OK_SECONDS = 30 * 24 * 60 * 60;
/** Resultado ruim cacheia pouco — não fossilizar um provider que caiu por 30 dias. */
const CACHE_TTL_UNVERIFIED_SECONDS = 60;
/** ToS do Nominatim: 1 req/s no máximo, GLOBAL (não por IP do cliente). */
const NOMINATIM_RATE_KEY = 'geo:nominatim';
const NOMINATIM_WAIT_MS = 1_100;

type ViaCepOutcome =
  | { status: 'found'; street: string | null; neighborhood: string | null; city: string | null; state: string | null }
  /** O CEP não existe — não adianta perguntar pro OSM. */
  | { status: 'not_found' }
  /** ViaCEP fora do ar/timeout — ainda vale tentar o centroide no OSM. */
  | { status: 'unavailable' };

/**
 * ViaCEP (endereço) + Nominatim/OSM (ponto), com cache de CEP e o throttle
 * de 1 req/s que o ToS do Nominatim exige.
 *
 * Cadeia: ViaCEP → Nominatim estruturado (rua+número) → Nominatim só por CEP
 * (centroide) → `unverified`. Cada passo tem timeout de 2s e nunca lança:
 * geocoder mudo devolve `unverified`, quem decide o que fazer com isso é o
 * chamador.
 *
 * `fetchFn` é injetável só pra teste (sem mock global) — em produção é
 * sempre o `fetch` do Node.
 */
export class ViaCepNominatimGeocoder implements Geocoder {
  private readonly logger = new Logger('geo');

  constructor(
    private readonly cache: GeoCache,
    private readonly rateLimiter: RateLimiter,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async resolve(input: GeocodeInput): Promise<GeocodedAddress> {
    const cep = normalizePostalCode(input.postalCode);
    // Formato inválido nunca deveria chegar aqui (o DTO barra antes), mas
    // custa uma linha não fazer request externo com lixo.
    if (!cep) return unverified(false);

    const cacheKey = `geo:cep:${cep}:${input.number ?? 's/n'}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      const parsed = parseCached(cached);
      if (parsed) return parsed;
    }

    const resolved = await this.lookup(cep, input.number);

    await this.cache.set(
      cacheKey,
      JSON.stringify(resolved),
      resolved.precision === 'unverified' ? CACHE_TTL_UNVERIFIED_SECONDS : CACHE_TTL_OK_SECONDS,
    );

    // Log estruturado com o CEP (nunca o número — CEP sozinho é segmento de
    // rua, não identifica pessoa). É o que sustenta medir a frequência real
    // de `unverified` na semana do piloto e decidir por tabela estática de
    // centroide.
    this.logger.log(JSON.stringify({ action: 'geocode', postalCode: cep, precision: resolved.precision, postalCodeFound: resolved.postalCodeFound }));

    return resolved;
  }

  private async lookup(cep: string, number: string | null): Promise<GeocodedAddress> {
    const viaCep = await this.fetchViaCep(cep);
    if (viaCep.status === 'not_found') return unverified(false);

    const postalCodeFound = viaCep.status === 'found';
    // Desestrutura em vez de espalhar `viaCep`: `status` é detalhe do
    // outcome interno, não pertence ao GeocodedAddress devolvido.
    const address = postalCodeFound
      ? { street: viaCep.street, neighborhood: viaCep.neighborhood, city: viaCep.city, state: viaCep.state }
      : { street: null, neighborhood: null, city: null, state: null };

    // 1. Consulta estruturada (rua + número). Só faz sentido com o que o
    //    ViaCEP devolveu — sem rua/cidade, cai direto no centroide.
    if (address.street && address.city) {
      const point = await this.queryNominatim({
        postalcode: cep,
        street: [number, address.street].filter(Boolean).join(' '),
        city: address.city,
        state: address.state ?? '',
        country: 'Brazil',
      });
      if (point) return { ...address, ...point, precision: 'address', postalCodeFound };
    }

    // 2. Centroide do CEP — só pago quando (1) não achou.
    const centroid = await this.queryNominatim({ postalcode: cep, country: 'Brazil' });
    if (centroid) {
      return { ...address, ...centroid, precision: 'postal_centroid', postalCodeFound };
    }

    return { ...address, lat: null, lng: null, precision: 'unverified', postalCodeFound };
  }

  private async fetchViaCep(cep: string): Promise<ViaCepOutcome> {
    const body = asRecord(await this.getJson(`${VIACEP_BASE}/${cep}/json/`));
    if (!body) return { status: 'unavailable' };
    // ViaCEP sinaliza CEP inexistente com `erro` (booleano em versões
    // antigas, string "true" nas novas) — qualquer valor truthy conta.
    if (body.erro) return { status: 'not_found' };

    return {
      status: 'found',
      street: asString(body.logradouro),
      neighborhood: asString(body.bairro),
      city: asString(body.localidade),
      state: asString(body.uf),
    };
  }

  private async queryNominatim(params: Record<string, string>): Promise<{ lat: number; lng: number } | null> {
    if (!(await this.throttle())) return null;

    const url = new URL(NOMINATIM_BASE);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }

    const body = await this.getJson(url.toString());
    const hit = Array.isArray(body) ? asRecord(body[0]) : null;
    if (!hit) return null;

    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  /**
   * 1 req/s global. Estourou: espera 1,1s (a janela deslizante já limpou) e
   * tenta UMA vez — nunca enfileira. Teto do caminho infeliz é ~3,1s, não
   * uma fila crescente de requests presos esperando o OSM.
   */
  private async throttle(): Promise<boolean> {
    if (await this.rateLimiter.checkAndRecord(NOMINATIM_RATE_KEY, 1, 1)) return true;
    await sleep(NOMINATIM_WAIT_MS);
    return this.rateLimiter.checkAndRecord(NOMINATIM_RATE_KEY, 1, 1);
  }

  /** Nunca lança: timeout, DNS, 500, JSON quebrado — tudo vira `null`. */
  private async getJson(url: string): Promise<unknown> {
    try {
      const response = await this.fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}

function unverified(postalCodeFound: boolean): GeocodedAddress {
  return { street: null, neighborhood: null, city: null, state: null, lat: null, lng: null, precision: 'unverified', postalCodeFound };
}

function parseCached(raw: string): GeocodedAddress | null {
  try {
    const parsed = asRecord(JSON.parse(raw));
    return parsed && typeof parsed.precision === 'string' ? (parsed as unknown as GeocodedAddress) : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
