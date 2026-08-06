import { describe, expect, it, vi } from 'vitest';
import { InMemorySlidingWindowRateLimiter } from '../rate-limit/rate-limiter';
import { InMemoryGeoCache } from './geocoder';
import { ViaCepNominatimGeocoder } from './viacep-nominatim.geocoder';

const VIA_CEP_OK = {
  logradouro: 'Avenida Paulista',
  bairro: 'Bela Vista',
  localidade: 'São Paulo',
  uf: 'SP',
};

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

/**
 * Roteia por URL — cada teste declara o que ViaCEP e Nominatim respondem.
 * `nominatim` recebe a URL inteira pra o teste poder distinguir a consulta
 * estruturada (tem `street`) do centroide (só `postalcode`).
 */
function fakeFetch(handlers: {
  viaCep?: () => Response | Promise<Response> | never;
  nominatim?: (url: URL) => Response | Promise<Response> | never;
}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname.includes('viacep')) {
      if (!handlers.viaCep) throw new Error('ViaCEP não deveria ter sido chamado');
      return handlers.viaCep();
    }
    if (!handlers.nominatim) throw new Error('Nominatim não deveria ter sido chamado');
    return handlers.nominatim(url);
  }) as unknown as typeof fetch;
}

function build(fetchFn: typeof fetch) {
  return new ViaCepNominatimGeocoder(new InMemoryGeoCache(), new InMemorySlidingWindowRateLimiter(), fetchFn);
}

describe('ViaCepNominatimGeocoder', () => {
  it('resolve endereço com precisão address quando ViaCEP e Nominatim respondem', async () => {
    const geocoder = build(
      fakeFetch({
        viaCep: () => jsonResponse(VIA_CEP_OK),
        nominatim: () => jsonResponse([{ lat: '-23.5613', lon: '-46.6565' }]),
      }),
    );

    const result = await geocoder.resolve({ postalCode: '01310-100', number: '1578' });

    expect(result).toEqual({
      street: 'Avenida Paulista',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      lat: -23.5613,
      lng: -46.6565,
      precision: 'address',
      postalCodeFound: true,
    });
  });

  it('cai no centroide do CEP quando a consulta estruturada não acha', async () => {
    const geocoder = build(
      fakeFetch({
        viaCep: () => jsonResponse(VIA_CEP_OK),
        // Estruturada (tem `street`) devolve vazio; só por CEP devolve ponto.
        nominatim: (url) =>
          jsonResponse(url.searchParams.has('street') ? [] : [{ lat: '-23.56', lon: '-46.65' }]),
      }),
    );

    const result = await geocoder.resolve({ postalCode: '01310100', number: '1578' });

    expect(result.precision).toBe('postal_centroid');
    expect(result.lat).toBe(-23.56);
    // Rua/bairro do ViaCEP sobrevivem ao fallback de ponto.
    expect(result.street).toBe('Avenida Paulista');
  });

  it('CEP inexistente vira unverified sem nem chamar o Nominatim', async () => {
    const geocoder = build(fakeFetch({ viaCep: () => jsonResponse({ erro: 'true' }) }));

    const result = await geocoder.resolve({ postalCode: '00000-000', number: '1' });

    expect(result.precision).toBe('unverified');
    expect(result.postalCodeFound).toBe(false);
    expect(result.lat).toBeNull();
  });

  it('ViaCEP fora do ar ainda tenta o centroide e devolve o ponto', async () => {
    const geocoder = build(
      fakeFetch({
        viaCep: () => {
          throw new Error('ETIMEDOUT');
        },
        nominatim: () => jsonResponse([{ lat: '-23.5', lon: '-46.6' }]),
      }),
    );

    const result = await geocoder.resolve({ postalCode: '01310-100', number: '1578' });

    expect(result.precision).toBe('postal_centroid');
    expect(result.street).toBeNull();
    // ViaCEP mudo ≠ CEP inexistente: não afirmamos que o CEP existe.
    expect(result.postalCodeFound).toBe(false);
  });

  it('os dois provedores mudos viram unverified, nunca exceção', async () => {
    const geocoder = build(
      fakeFetch({
        viaCep: () => jsonResponse(VIA_CEP_OK),
        nominatim: () => {
          throw new Error('ETIMEDOUT');
        },
      }),
    );

    const result = await geocoder.resolve({ postalCode: '01310-100', number: '1578' });

    expect(result.precision).toBe('unverified');
    expect(result.postalCodeFound).toBe(true);
    expect(result.city).toBe('São Paulo');
  });

  it('segunda resolução do mesmo CEP+número não faz request externo', async () => {
    const fetchFn = fakeFetch({
      viaCep: () => jsonResponse(VIA_CEP_OK),
      nominatim: () => jsonResponse([{ lat: '-23.5613', lon: '-46.6565' }]),
    });
    const geocoder = build(fetchFn);

    const primeira = await geocoder.resolve({ postalCode: '01310-100', number: '1578' });
    const chamadasApos1a = (fetchFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    const segunda = await geocoder.resolve({ postalCode: '01310100', number: '1578' });

    expect(segunda).toEqual(primeira);
    expect((fetchFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(chamadasApos1a);
  });

  it('CEP com formato inválido não vira request externo', async () => {
    const geocoder = build(fakeFetch({}));

    const result = await geocoder.resolve({ postalCode: '123', number: '1' });

    expect(result.precision).toBe('unverified');
  });
});
