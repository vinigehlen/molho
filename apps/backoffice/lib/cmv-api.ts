import type { CmvDashboard, CmvIngredient, CmvRecipeSummary } from '@molho/contracts';
import { apiFetch } from './api-client';
import type { AnalyticsFilters } from './analytics-api';

function cmvPath(storeId: string, endpoint: string, filters?: AnalyticsFilters) {
  const params = new URLSearchParams();
  if (filters) {
    params.set('from', filters.from);
    params.set('to', filters.to);
    if (filters.fulfillment && filters.fulfillment !== 'all') params.set('fulfillment', filters.fulfillment);
  }
  const qs = params.toString();
  return `/v1/admin/stores/${encodeURIComponent(storeId)}/analytics/cmv/${endpoint}${qs ? `?${qs}` : ''}`;
}

async function readJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} (${res.status})`);
  return (await res.json()) as T;
}

export async function fetchCmvDashboard(storeId: string, filters: AnalyticsFilters): Promise<CmvDashboard> {
  return readJson(await apiFetch(cmvPath(storeId, 'dashboard', filters)), 'Falha ao carregar CMV');
}

export async function fetchCmvIngredients(storeId: string): Promise<CmvIngredient[]> {
  return readJson(await apiFetch(cmvPath(storeId, 'ingredients')), 'Falha ao carregar insumos');
}

export async function fetchCmvRecipes(storeId: string): Promise<CmvRecipeSummary[]> {
  return readJson(await apiFetch(cmvPath(storeId, 'recipes')), 'Falha ao carregar fichas técnicas');
}
