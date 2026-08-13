import type { PutStoreHoursInput, StoreHoursResponse } from '@molho/contracts';
import { apiFetch } from './api-client';

function hoursPath(storeId: string) {
  return `/v1/admin/stores/${encodeURIComponent(storeId)}/hours`;
}

export async function fetchStoreHours(storeId: string): Promise<StoreHoursResponse> {
  const res = await apiFetch(hoursPath(storeId));
  if (!res.ok) throw new Error(`Falha ao carregar horários (${res.status})`);
  return (await res.json()) as StoreHoursResponse;
}

export async function saveStoreHours(storeId: string, input: PutStoreHoursInput): Promise<StoreHoursResponse> {
  const res = await apiFetch(hoursPath(storeId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao salvar horários (${res.status})`);
  return (await res.json()) as StoreHoursResponse;
}
