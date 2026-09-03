import { apiFetch } from './api-client';

export interface LoyaltyConfig {
  cashbackPercent: number;
  version: number;
}

export async function fetchLoyaltyConfig(): Promise<LoyaltyConfig> {
  const res = await apiFetch('/v1/admin/loyalty/config');
  if (!res.ok) throw new Error(`Falha ao carregar configuração de fidelidade (${res.status})`);
  return (await res.json()) as LoyaltyConfig;
}

export async function updateLoyaltyConfig(config: LoyaltyConfig, cashbackPercent: number): Promise<LoyaltyConfig> {
  const res = await apiFetch('/v1/admin/loyalty/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: config.version, cashbackPercent }),
  });
  if (!res.ok) throw new Error(`Falha ao salvar configuração de fidelidade (${res.status})`);
  return (await res.json()) as LoyaltyConfig;
}
