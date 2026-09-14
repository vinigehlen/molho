'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  createStore,
  fetchStores,
  MultiStoreUnavailableError,
  type StoreSummary,
} from '../../../lib/store-admin-api';

/**
 * Multi-loja V1 (PR1 backend+admin) — só criar/listar loja aqui. Depois de
 * criada, a loja já aparece sozinha no seletor de "Balcão"/"Analytics"/
 * "CMV"/"Entrega"/"Configuração" (fetchMyStores lê o mesmo /v1/me/sessions/
 * tenants) — nada mais precisa mudar nessas telas. Storefront público por
 * loja (URL própria) é PR2, ainda não existe.
 */
export function StoreListCard() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable' | 'error'; stores: StoreSummary[] }>({
    status: 'loading',
    stores: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [addressText, setAddressText] = useState('');

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', stores: await fetchStores() });
    } catch (err) {
      setState({ status: err instanceof MultiStoreUnavailableError ? 'unavailable' : 'error', stores: [] });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'unavailable') return null;

  return (
    <section className="rounded-[14px] border border-border bg-bg p-4">
      <h3 className="text-base font-semibold text-text">Lojas</h3>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        Cada loja tem endereço, horário, zona de entrega e caixa próprios. Depois de criar, ela já aparece no seletor
        de loja em Balcão, Analytics e Configuração.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || !addressText.trim()) return;
          setBusy(true);
          setError(null);
          void createStore({ name: name.trim(), addressText: addressText.trim() })
            .then(async () => {
              setName('');
              setAddressText('');
              await load();
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Não deu certo agora.'))
            .finally(() => setBusy(false));
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Nome da loja
          <input
            className="rounded-[10px] border border-border bg-bg-card px-3 py-2 text-sm text-text"
            placeholder="Ex.: Filial Zona Sul"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Endereço
          <input
            className="rounded-[10px] border border-border bg-bg-card px-3 py-2 text-sm text-text"
            placeholder="Rua, número, bairro"
            value={addressText}
            maxLength={200}
            onChange={(event) => setAddressText(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim() || !addressText.trim()}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-50"
        >
          Criar loja
        </button>
      </form>

      {error && (
        <p className="mt-2 text-xs font-medium text-critical" aria-live="polite">
          {error}
        </p>
      )}

      <ul className="mt-4 divide-y divide-border">
        {state.status === 'loading' && <li className="py-3 text-sm text-text-muted">Carregando…</li>}
        {state.status === 'error' && <li className="py-3 text-sm text-critical">Não deu pra carregar as lojas.</li>}
        {state.stores.map((store) => (
          <li key={store.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-sm font-medium text-text">
                {store.name} {store.isPrimary && <span className="font-normal text-text-muted">· principal</span>}
              </p>
              <p className="text-xs text-text-muted">{store.addressText}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
