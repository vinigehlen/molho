import type { CounterOrderPaymentMethod, CounterOrderResponse } from '@molho/contracts';
import { apiFetch } from './api-client';

export interface CounterCategory {
  id: string;
  name: string;
  visible: boolean;
}

export interface CounterProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  available: boolean;
}

export interface CounterCartItem {
  productId: string;
  quantity: number;
}

export async function fetchCounterCatalog(): Promise<{ categories: CounterCategory[]; products: CounterProduct[] }> {
  const categoriesRes = await apiFetch('/v1/admin/categories');
  if (!categoriesRes.ok) throw new Error(`Falha ao carregar categorias (${categoriesRes.status})`);
  const categories = ((await categoriesRes.json()) as CounterCategory[]).filter((category) => category.visible);

  const productsByCategory = await Promise.all(
    categories.map(async (category) => {
      const res = await apiFetch(`/v1/admin/products?categoryId=${encodeURIComponent(category.id)}`);
      if (!res.ok) throw new Error(`Falha ao carregar produtos (${res.status})`);
      return ((await res.json()) as CounterProduct[]).filter((product) => product.available);
    }),
  );

  return { categories, products: productsByCategory.flat() };
}

export async function createCounterOrder(input: {
  storeId: string;
  items: CounterCartItem[];
  paymentMethod: CounterOrderPaymentMethod;
  customerName?: string;
  notes?: string;
}): Promise<CounterOrderResponse> {
  const res = await apiFetch(`/v1/admin/stores/${encodeURIComponent(input.storeId)}/counter-orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      items: input.items.map((item) => ({ kind: 'unit', productId: item.productId, quantity: item.quantity })),
      paymentMethod: input.paymentMethod,
      customerName: input.customerName?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao criar pedido de balcão (${res.status})`);
  return (await res.json()) as CounterOrderResponse;
}
