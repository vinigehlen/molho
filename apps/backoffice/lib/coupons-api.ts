import { apiFetch } from './api-client';

export type CouponDiscountType = 'percent' | 'fixed';

export interface Coupon {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountPercent: number | null;
  discountValueCents: number | null;
  minOrderCents: number;
  startsAt: string;
  endsAt: string;
  maxUses: number;
  usesCount: number;
  active: boolean;
  version: number;
}

export interface CreateCouponInput {
  code: string;
  discountType: CouponDiscountType;
  discountPercent?: number;
  discountValueCents?: number;
  minOrderCents?: number;
  startsAt: string;
  endsAt: string;
  maxUses: number;
}

export async function fetchCoupons(): Promise<Coupon[]> {
  const res = await apiFetch('/v1/admin/coupons');
  if (!res.ok) throw new Error(`Falha ao carregar cupons (${res.status})`);
  return (await res.json()) as Coupon[];
}

export async function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  const res = await apiFetch('/v1/admin/coupons', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao criar cupom (${res.status})`);
  return (await res.json()) as Coupon;
}

export async function setCouponActive(coupon: Coupon, active: boolean): Promise<Coupon> {
  const res = await apiFetch(`/v1/admin/coupons/${encodeURIComponent(coupon.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: coupon.version, active }),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar cupom (${res.status})`);
  return (await res.json()) as Coupon;
}

export async function deleteCoupon(coupon: Coupon): Promise<void> {
  const res = await apiFetch(`/v1/admin/coupons/${encodeURIComponent(coupon.id)}?version=${encodeURIComponent(coupon.version)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Falha ao remover cupom (${res.status})`);
}
