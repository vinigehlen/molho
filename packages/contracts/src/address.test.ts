import { describe, expect, it } from 'vitest';
import { ADDRESS_SCHEMA_VERSION, type CustomerAddress, addressStorageKey, parseStoredAddress } from './address';

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
    postalCode: '93610-000',
    referencePoint: 'perto da padaria',
    lat: -29.6,
    lng: -51.17,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('addressStorageKey', () => {
  it('namespaceia por slug, mesmo isolamento do carrinho', () => {
    expect(addressStorageKey('hamburgueria-da-vila')).toBe('molho:address:hamburgueria-da-vila');
    expect(addressStorageKey('pizzaria-roma')).not.toBe(addressStorageKey('hamburgueria-da-vila'));
  });
});

describe('parseStoredAddress', () => {
  it('lê de volta um endereço válido que ele mesmo serializou', () => {
    const original = address();
    const restored = parseStoredAddress(JSON.stringify(original));
    expect(restored).toEqual(original);
  });

  it('devolve null quando não há nada salvo', () => {
    expect(parseStoredAddress(null)).toBeNull();
  });

  it('não lança em JSON corrompido — devolve null', () => {
    expect(() => parseStoredAddress('{isto não é json')).not.toThrow();
    expect(parseStoredAddress('{isto não é json')).toBeNull();
  });

  it('aceita endereço sem coordenada — cliente não tocou "usar minha localização" ainda', () => {
    const semGeo = address({ lat: null, lng: null });
    expect(parseStoredAddress(JSON.stringify(semGeo))).toEqual(semGeo);
  });

  it('descarta endereço com lat/lng fora do intervalo válido (payload adulterado à mão)', () => {
    const adulterado = address({ lat: 200 });
    expect(parseStoredAddress(JSON.stringify(adulterado))).toBeNull();
  });

  it('descarta endereço gravado em formato antigo, em vez de estourar', () => {
    const formatoAntigo = { ...address(), schemaVersion: ADDRESS_SCHEMA_VERSION - 1 };
    expect(parseStoredAddress(JSON.stringify(formatoAntigo))).toBeNull();
  });
});
