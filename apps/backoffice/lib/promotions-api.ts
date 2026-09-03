import { apiFetch } from './api-client';

export type PromotionDiscountType = 'percent' | 'fixed';
export type PromotionScope = 'store_wide' | 'category' | 'product';

export interface Promotion {
  id: string;
  name: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  weekdays: number[];
  startTime: string;
  endTime: string;
  scope: PromotionScope;
  scopeId: string | null;
  active: boolean;
  version: number;
}

export interface CreatePromotionInput {
  name: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  weekdays: number[];
  startTime: string;
  endTime: string;
  scope: PromotionScope;
  scopeId?: string;
}

export async function fetchPromotions(): Promise<Promotion[]> {
  const res = await apiFetch('/v1/admin/promotions');
  if (!res.ok) throw new Error(`Falha ao carregar promoções (${res.status})`);
  return (await res.json()) as Promotion[];
}

export async function createPromotion(input: CreatePromotionInput): Promise<Promotion> {
  const res = await apiFetch('/v1/admin/promotions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao criar promoção (${res.status})`);
  return (await res.json()) as Promotion;
}

export async function setPromotionActive(promotion: Promotion, active: boolean): Promise<Promotion> {
  const res = await apiFetch(`/v1/admin/promotions/${encodeURIComponent(promotion.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: promotion.version, active }),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar promoção (${res.status})`);
  return (await res.json()) as Promotion;
}

export async function deletePromotion(promotion: Promotion): Promise<void> {
  const res = await apiFetch(
    `/v1/admin/promotions/${encodeURIComponent(promotion.id)}?version=${encodeURIComponent(promotion.version)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Falha ao remover promoção (${res.status})`);
}
