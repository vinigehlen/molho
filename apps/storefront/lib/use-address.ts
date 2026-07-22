'use client';

import * as React from 'react';
import type { CustomerAddress } from '@molho/contracts';
import { addressStorageKey, parseStoredAddress } from './address-storage';

/**
 * Estado do endereço do cliente — mesmo padrão de `use-cart.ts`:
 * `localStorage` é a fonte de verdade, `BroadcastChannel` sincroniza abas
 * abertas. CLAUDE.md regra 13: isto é TODO o armazenamento de endereço
 * neste épico — vira linha em `addresses` só depois do OTP no checkout
 * (Épico 7).
 */
export interface UseAddressResult {
  address: CustomerAddress | null;
  setAddress: (address: CustomerAddress) => void;
  clearAddress: () => void;
}

export function useAddress(slug: string): UseAddressResult {
  const [address, setAddressState] = React.useState<CustomerAddress | null>(null);
  const canalRef = React.useRef<BroadcastChannel | null>(null);

  React.useEffect(() => {
    setAddressState(parseStoredAddress(localStorage.getItem(addressStorageKey(slug))));

    if (typeof BroadcastChannel === 'undefined') return;

    const canal = new BroadcastChannel(addressStorageKey(slug));
    canalRef.current = canal;
    canal.onmessage = (evento: MessageEvent<CustomerAddress | null>) => setAddressState(evento.data);

    return () => {
      canal.close();
      canalRef.current = null;
    };
  }, [slug]);

  const persistirEPropagar = React.useCallback(
    (proximo: CustomerAddress | null) => {
      setAddressState(proximo);
      if (proximo) {
        localStorage.setItem(addressStorageKey(slug), JSON.stringify(proximo));
      } else {
        localStorage.removeItem(addressStorageKey(slug));
      }
      canalRef.current?.postMessage(proximo);
    },
    [slug],
  );

  const setAddress = React.useCallback(
    (proximo: CustomerAddress) => persistirEPropagar(proximo),
    [persistirEPropagar],
  );

  const clearAddress = React.useCallback(() => persistirEPropagar(null), [persistirEPropagar]);

  return { address, setAddress, clearAddress };
}
