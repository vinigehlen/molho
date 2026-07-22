import type { CustomerAddress } from '@molho/contracts';
import { describe, expect, it } from 'vitest';
import { ADDRESS_SCHEMA_VERSION, addressStorageKey, parseStoredAddress } from './address-storage';

/** Espelha packages/contracts/src/address.test.ts de propósito — mesmo comportamento, duas fontes. */
function address(overrides: Partial<CustomerAddress> = {}): CustomerAddress {
  return {
    schemaVersion: ADDRESS_SCHEMA_VERSION,
    label: 'Casa',
    street: 'Rua das Palmeiras',
    number: '120',
    complement: null,
    neighborhood: 'Bela Vista',
    city: 'Estância Velha',
    state: 'RS',
    postalCode: '93600-000',
    referencePoint: 'perto da padaria',
    lat: -29.6,
    lng: -51.17,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('addressStorageKey', () => {
  it('namespaceia por slug', () => {
    expect(addressStorageKey('hamburgueria-da-vila')).toBe('molho:address:hamburgueria-da-vila');
  });
});

describe('parseStoredAddress', () => {
  it('lê de volta um endereço válido que ele mesmo serializou', () => {
    const original = address();
    expect(parseStoredAddress(JSON.stringify(original))).toEqual(original);
  });

  it('devolve null quando não há nada salvo', () => {
    expect(parseStoredAddress(null)).toBeNull();
  });

  it('não lança em JSON corrompido — devolve null', () => {
    expect(() => parseStoredAddress('{isto não é json')).not.toThrow();
    expect(parseStoredAddress('{isto não é json')).toBeNull();
  });

  it('aceita endereço sem coordenada', () => {
    const semGeo = address({ lat: null, lng: null });
    expect(parseStoredAddress(JSON.stringify(semGeo))).toEqual(semGeo);
  });

  it('descarta endereço com lat/lng fora do intervalo válido', () => {
    expect(parseStoredAddress(JSON.stringify(address({ lat: 200 })))).toBeNull();
  });

  it('descarta endereço gravado em formato antigo', () => {
    const formatoAntigo = { ...address(), schemaVersion: ADDRESS_SCHEMA_VERSION - 1 };
    expect(parseStoredAddress(JSON.stringify(formatoAntigo))).toBeNull();
  });
});
