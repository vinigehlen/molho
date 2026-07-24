import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CUSTOMER_TOKEN_SCHEMA_VERSION, customerTokenStorageKey } from './customer-token-storage';
import { useCustomerToken } from './use-customer-token';

const SLUG = 'hamburgueria-da-vila';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useCustomerToken', () => {
  it('começa null quando não há nada salvo', () => {
    const { result } = renderHook(() => useCustomerToken(SLUG));
    expect(result.current.token).toBeNull();
    expect(result.current.customerId).toBeNull();
  });

  it('lê um token válido já salvo ao montar', async () => {
    localStorage.setItem(
      customerTokenStorageKey(SLUG),
      JSON.stringify({
        schemaVersion: CUSTOMER_TOKEN_SCHEMA_VERSION,
        accessToken: 'token-salvo',
        customerId: 'customer-1',
        issuedAt: new Date().toISOString(),
      }),
    );

    const { result } = renderHook(() => useCustomerToken(SLUG));
    await waitFor(() => expect(result.current.token).toBe('token-salvo'));
  });

  it('token expirado salvo: não é lido (fica null)', async () => {
    localStorage.setItem(
      customerTokenStorageKey(SLUG),
      JSON.stringify({
        schemaVersion: CUSTOMER_TOKEN_SCHEMA_VERSION,
        accessToken: 'token-velho',
        customerId: 'customer-1',
        issuedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }),
    );

    const { result } = renderHook(() => useCustomerToken(SLUG));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.token).toBeNull();
  });

  it('setToken grava no localStorage', () => {
    const { result } = renderHook(() => useCustomerToken(SLUG));

    act(() => result.current.setToken('novo-token', 'customer-2'));

    expect(result.current.token).toBe('novo-token');
    expect(result.current.customerId).toBe('customer-2');
    const salvo = JSON.parse(localStorage.getItem(customerTokenStorageKey(SLUG)) ?? 'null');
    expect(salvo.accessToken).toBe('novo-token');
  });

  it('clearToken remove do localStorage', () => {
    const { result } = renderHook(() => useCustomerToken(SLUG));

    act(() => result.current.setToken('token', 'customer-1'));
    act(() => result.current.clearToken());

    expect(result.current.token).toBeNull();
    expect(localStorage.getItem(customerTokenStorageKey(SLUG))).toBeNull();
  });

  it('token de OUTRA loja nunca aparece: chave por slug', () => {
    const lojaA = renderHook(() => useCustomerToken('hamburgueria-da-vila'));
    const lojaB = renderHook(() => useCustomerToken('pizzaria-roma'));

    act(() => lojaA.result.current.setToken('token-a', 'customer-a'));

    expect(lojaB.result.current.token).toBeNull();
  });
});
