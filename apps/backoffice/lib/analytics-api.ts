import type {
  AnalyticsCustomer,
  AnalyticsFulfillment,
  AnalyticsGranularity,
  AnalyticsIdleItem,
  AnalyticsOverview,
  AnalyticsPeakHour,
  AnalyticsRegion,
  AnalyticsTimeseriesPoint,
  AnalyticsTopItem,
  AnalyticsTopItemsSort,
} from '@molho/contracts';
import { apiFetch } from './api-client';

export interface AnalyticsFilters {
  from: string;
  to: string;
  fulfillment?: AnalyticsFulfillment | 'all';
}

function analyticsPath(storeId: string, endpoint: string, filters: AnalyticsFilters, extra?: Record<string, string | number>) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.fulfillment && filters.fulfillment !== 'all') params.set('fulfillment', filters.fulfillment);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, String(value));
  return `/v1/admin/stores/${encodeURIComponent(storeId)}/analytics/${endpoint}?${params.toString()}`;
}

async function readJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} (${res.status})`);
  return (await res.json()) as T;
}

export async function fetchAnalyticsOverview(storeId: string, filters: AnalyticsFilters): Promise<AnalyticsOverview> {
  return readJson(await apiFetch(analyticsPath(storeId, 'overview', filters)), 'Falha ao carregar visão geral');
}

export async function fetchAnalyticsTimeseries(
  storeId: string,
  filters: AnalyticsFilters,
  granularity: AnalyticsGranularity,
): Promise<AnalyticsTimeseriesPoint[]> {
  return readJson(await apiFetch(analyticsPath(storeId, 'timeseries', filters, { granularity })), 'Falha ao carregar série');
}

export async function fetchAnalyticsPeakHours(storeId: string, filters: AnalyticsFilters): Promise<AnalyticsPeakHour[]> {
  return readJson(await apiFetch(analyticsPath(storeId, 'peak-hours', filters)), 'Falha ao carregar horários');
}

export async function fetchAnalyticsTopItems(
  storeId: string,
  filters: AnalyticsFilters,
  sort: AnalyticsTopItemsSort,
): Promise<AnalyticsTopItem[]> {
  return readJson(await apiFetch(analyticsPath(storeId, 'top-items', filters, { limit: 8, sort })), 'Falha ao carregar itens');
}

export async function fetchAnalyticsCustomers(storeId: string, filters: AnalyticsFilters): Promise<AnalyticsCustomer[] | null> {
  const res = await apiFetch(analyticsPath(storeId, 'customers', filters, { limit: 8 }));
  if (res.status === 403) return null;
  return readJson(res, 'Falha ao carregar clientes');
}

export async function fetchAnalyticsRegions(storeId: string, filters: AnalyticsFilters): Promise<AnalyticsRegion[]> {
  return readJson(await apiFetch(analyticsPath(storeId, 'regions', filters)), 'Falha ao carregar regiões');
}

export async function fetchAnalyticsIdleItems(storeId: string, filters: AnalyticsFilters): Promise<AnalyticsIdleItem[]> {
  return readJson(await apiFetch(analyticsPath(storeId, 'idle-items', filters)), 'Falha ao carregar itens sem venda');
}
