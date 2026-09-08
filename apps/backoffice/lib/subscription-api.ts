import type { SubscriptionResponse } from '@molho/contracts';
import { apiFetch } from './api-client';

export type { SubscriptionResponse };

export async function fetchSubscription(): Promise<SubscriptionResponse> {
  const res = await apiFetch('/v1/admin/subscription');
  if (!res.ok) throw new Error(`Falha ao carregar assinatura (${res.status})`);
  return (await res.json()) as SubscriptionResponse;
}

export class SubscriptionAlreadyCanceledError extends Error {}

/** "Cancelamento em 2 cliques" — o segundo clique É esta chamada (o 1º só abre o `window.confirm`). */
export async function cancelSubscription(): Promise<SubscriptionResponse> {
  const res = await apiFetch('/v1/admin/subscription/cancel', { method: 'POST' });
  if (res.status === 409) throw new SubscriptionAlreadyCanceledError('Essa assinatura já está cancelada.');
  if (!res.ok) throw new Error(`Falha ao cancelar assinatura (${res.status})`);
  return (await res.json()) as SubscriptionResponse;
}
