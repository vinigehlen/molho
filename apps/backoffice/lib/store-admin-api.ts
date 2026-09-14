import { apiFetch } from './api-client';

export interface StoreSummary {
  id: string;
  name: string;
  slug: string;
  isPrimary: boolean;
  addressText: string;
  timezone: string;
  createdAt: string;
}

/** Sem módulo multi_store (ou plano abaixo do premium) — a seção nem aparece (mesmo padrão de PrintingUnavailableError/TeamUnavailableError). */
export class MultiStoreUnavailableError extends Error {
  constructor() {
    super('Múltiplas lojas não está disponível no seu plano.');
  }
}

export async function fetchStores(): Promise<StoreSummary[]> {
  const res = await apiFetch('/v1/admin/stores');
  if (res.status === 403) throw new MultiStoreUnavailableError();
  if (!res.ok) throw new Error(`Falha ao carregar lojas (${res.status})`);
  return (await res.json()) as StoreSummary[];
}

export async function createStore(input: { name: string; addressText: string; timezone?: string }): Promise<StoreSummary> {
  const res = await apiFetch('/v1/admin/stores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timezone: 'America/Sao_Paulo', ...input }),
  });
  if (res.status === 403) throw new MultiStoreUnavailableError();
  if (!res.ok) throw new Error(`Falha ao criar loja (${res.status})`);
  return (await res.json()) as StoreSummary;
}
