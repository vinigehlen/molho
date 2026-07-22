import { act, renderHook, waitFor } from '@testing-library/react';
import type { CustomerAddress } from '@molho/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ADDRESS_SCHEMA_VERSION, addressStorageKey } from './address-storage';
import { useAddress } from './use-address';

const SLUG = 'hamburgueria-da-vila';

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
    referencePoint: null,
    lat: -29.6,
    lng: -51.17,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useAddress', () => {
  it('começa null quando não há nada salvo', () => {
    const { result } = renderHook(() => useAddress(SLUG));
    expect(result.current.address).toBeNull();
  });

  it('lê o que já estava salvo no localStorage ao montar', async () => {
    localStorage.setItem(addressStorageKey(SLUG), JSON.stringify(address({ label: 'Trabalho' })));

    const { result } = renderHook(() => useAddress(SLUG));
    await waitFor(() => expect(result.current.address?.label).toBe('Trabalho'));
  });

  it('setAddress grava no localStorage', () => {
    const { result } = renderHook(() => useAddress(SLUG));

    act(() => result.current.setAddress(address()));

    expect(result.current.address?.street).toBe('Rua das Palmeiras');
    const salvo = JSON.parse(localStorage.getItem(addressStorageKey(SLUG)) ?? 'null');
    expect(salvo.street).toBe('Rua das Palmeiras');
  });

  it('clearAddress remove do localStorage', () => {
    const { result } = renderHook(() => useAddress(SLUG));

    act(() => result.current.setAddress(address()));
    act(() => result.current.clearAddress());

    expect(result.current.address).toBeNull();
    expect(localStorage.getItem(addressStorageKey(SLUG))).toBeNull();
  });

  it('duas "abas" sincronizam via BroadcastChannel', async () => {
    const abaA = renderHook(() => useAddress(SLUG));
    const abaB = renderHook(() => useAddress(SLUG));

    act(() => abaA.result.current.setAddress(address({ label: 'Casa da Vila' })));

    await waitFor(() => expect(abaB.result.current.address?.label).toBe('Casa da Vila'));
  });

  it('endereço de OUTRA loja nunca aparece: chave por slug', async () => {
    const lojaA = renderHook(() => useAddress('hamburgueria-da-vila'));
    const lojaB = renderHook(() => useAddress('pizzaria-roma'));

    act(() => lojaA.result.current.setAddress(address()));

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lojaB.result.current.address).toBeNull();
  });
});
