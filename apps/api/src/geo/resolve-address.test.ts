import { describe, expect, it } from 'vitest';
import type { GeocodedAddress } from './geocoder';
import { resolveAddress } from './resolve-address';

const DO_CLIENTE = {
  street: '  Av. Brasil  ',
  neighborhood: 'Centro',
  city: 'Estancia Velha',
  state: 'rs',
};

function geocoded(overrides: Partial<GeocodedAddress> = {}): GeocodedAddress {
  return {
    street: 'Avenida Brasil',
    neighborhood: 'Rincão',
    city: 'Estância Velha',
    state: 'RS',
    lat: -29.6482,
    lng: -51.1789,
    precision: 'address',
    postalCodeFound: true,
    ...overrides,
  };
}

describe('resolveAddress', () => {
  it('ViaCEP ganha campo a campo quando responde', () => {
    expect(resolveAddress(DO_CLIENTE, geocoded())).toEqual({
      street: 'Avenida Brasil',
      neighborhood: 'Rincão',
      city: 'Estância Velha',
      state: 'RS',
      lat: -29.6482,
      lng: -51.1789,
      postalCodeVerified: true,
    });
  });

  it('texto do cliente preenche só o que o ViaCEP não trouxe, sem espaço nas pontas', () => {
    const resolved = resolveAddress(DO_CLIENTE, geocoded({ street: null, neighborhood: null }));
    expect(resolved.street).toBe('Av. Brasil');
    expect(resolved.neighborhood).toBe('Centro');
    // Cidade/UF continuam do ViaCEP — é o que decide a taxa.
    expect(resolved.city).toBe('Estância Velha');
  });

  it('ViaCEP mudo: tudo vem do cliente e o CEP fica NÃO verificado', () => {
    const resolved = resolveAddress(
      DO_CLIENTE,
      geocoded({ street: null, neighborhood: null, city: null, state: null, postalCodeFound: false, precision: 'postal_centroid' }),
    );
    // A cidade que vai decidir a taxa veio de texto digitado — o pedido passa,
    // mas nasce marcado pro lojista conferir a taxa antes de despachar.
    expect(resolved.city).toBe('Estancia Velha');
    expect(resolved.postalCodeVerified).toBe(false);
  });

  it('sem ponto nenhum: lat/lng nulos não invalidam o resto', () => {
    const resolved = resolveAddress(DO_CLIENTE, geocoded({ lat: null, lng: null, precision: 'unverified' }));
    expect(resolved.lat).toBeNull();
    expect(resolved.lng).toBeNull();
    expect(resolved.city).toBe('Estância Velha');
    // ViaCEP foi autoritativo — a falta de ponto não desverifica o CEP.
    expect(resolved.postalCodeVerified).toBe(true);
  });

  it('sem geocode nenhum (middleware não rodou): cai inteiro no texto do cliente', () => {
    const resolved = resolveAddress(DO_CLIENTE, undefined);
    expect(resolved).toEqual({
      street: 'Av. Brasil',
      neighborhood: 'Centro',
      city: 'Estancia Velha',
      state: 'rs',
      lat: null,
      lng: null,
      postalCodeVerified: false,
    });
  });

  it('não normaliza a cidade — quem compara é molho_city_key no Postgres', () => {
    // Uma segunda implementação do normalizador em TS poderia divergir num
    // acento, e o sintoma seria fora-de-área silencioso. A cidade sai daqui
    // em forma de EXIBIÇÃO.
    expect(resolveAddress(DO_CLIENTE, geocoded()).city).toBe('Estância Velha');
  });
});
