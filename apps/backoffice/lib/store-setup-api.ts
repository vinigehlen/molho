import type { StoreSetup, UpdateStoreSetupInput } from '@molho/contracts';
import { apiFetch } from './api-client';

function setupPath(storeId: string) {
  return `/v1/admin/stores/${encodeURIComponent(storeId)}/setup`;
}

export async function fetchStoreSetup(storeId: string): Promise<StoreSetup> {
  const res = await apiFetch(setupPath(storeId));
  if (!res.ok) throw new Error(`Falha ao carregar loja (${res.status})`);
  return (await res.json()) as StoreSetup;
}

export async function saveStoreSetup(storeId: string, input: UpdateStoreSetupInput): Promise<StoreSetup> {
  const res = await apiFetch(setupPath(storeId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao salvar loja (${res.status})`);
  return (await res.json()) as StoreSetup;
}
