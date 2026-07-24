'use client';

import * as React from 'react';
import {
  CUSTOMER_TOKEN_SCHEMA_VERSION,
  customerTokenStorageKey,
  parseStoredCustomerToken,
  type StoredCustomerToken,
} from './customer-token-storage';

export interface UseCustomerTokenResult {
  /** `null` = sem sessão válida (nunca logou nesta loja, ou o token de 15min expirou). */
  token: string | null;
  customerId: string | null;
  setToken: (accessToken: string, customerId: string) => void;
  clearToken: () => void;
}

/**
 * Sessão do cliente no checkout — `localStorage`, sem `BroadcastChannel`
 * (ao contrário de `use-cart.ts`/`use-address.ts`): é uma sessão de auth,
 * não um estado compartilhado que precise ficar em sincronia ao vivo entre
 * abas — cada aba que finalizar um pedido loga a sua própria vez se precisar.
 */
export function useCustomerToken(slug: string): UseCustomerTokenResult {
  const [stored, setStored] = React.useState<StoredCustomerToken | null>(null);

  React.useEffect(() => {
    setStored(parseStoredCustomerToken(localStorage.getItem(customerTokenStorageKey(slug))));
  }, [slug]);

  const setToken = React.useCallback(
    (accessToken: string, customerId: string) => {
      const next: StoredCustomerToken = {
        schemaVersion: CUSTOMER_TOKEN_SCHEMA_VERSION,
        accessToken,
        customerId,
        issuedAt: new Date().toISOString(),
      };
      setStored(next);
      localStorage.setItem(customerTokenStorageKey(slug), JSON.stringify(next));
    },
    [slug],
  );

  const clearToken = React.useCallback(() => {
    setStored(null);
    localStorage.removeItem(customerTokenStorageKey(slug));
  }, [slug]);

  return { token: stored?.accessToken ?? null, customerId: stored?.customerId ?? null, setToken, clearToken };
}
