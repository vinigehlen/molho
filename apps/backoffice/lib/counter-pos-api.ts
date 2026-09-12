import type {
  CounterOrderCustomerInput,
  CounterOrderPaymentMethod,
  CounterOrderResponse,
  CustomerSearchResult,
} from '@molho/contracts';
import type { MoProductSheetModifierGroup } from '@molho/ui';
import { apiFetch } from './api-client';
import { fetchModifierGroups, fetchModifiers } from './catalog-api';

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
  /** Só os IDs escolhidos — mesmo formato do checkout (preço vem do catálogo no servidor). */
  modifiers?: string[];
}

/** Grupos + modificadores ativos do produto, no formato que MoProductSheet espera. Vazio = pode adicionar direto, sem abrir o sheet. */
export async function fetchProductModifierGroups(productId: string): Promise<MoProductSheetModifierGroup[]> {
  const groups = (await fetchModifierGroups(productId)).filter((group) => group.active);
  return Promise.all(
    groups.map(async (group) => ({
      id: group.id,
      name: group.name,
      min: group.min,
      max: group.max,
      modifiers: (await fetchModifiers(group.id))
        .filter((modifier) => modifier.active !== false)
        .map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          description: modifier.description,
          imageUrl: modifier.imageUrl,
          priceDeltaCents: modifier.priceDeltaCents,
        })),
    })),
  );
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

export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await apiFetch(`/v1/admin/customers/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Falha na busca de clientes (${res.status})`);
  return (await res.json()) as CustomerSearchResult[];
}

export async function createCounterOrder(input: {
  storeId: string;
  items: CounterCartItem[];
  paymentMethod: CounterOrderPaymentMethod;
  customerName?: string;
  customer?: CounterOrderCustomerInput;
  notes?: string;
}): Promise<CounterOrderResponse> {
  const res = await apiFetch(`/v1/admin/stores/${encodeURIComponent(input.storeId)}/counter-orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      items: input.items.map((item) => ({
        kind: 'unit',
        productId: item.productId,
        quantity: item.quantity,
        ...(item.modifiers && item.modifiers.length > 0 ? { modifiers: item.modifiers } : {}),
      })),
      paymentMethod: input.paymentMethod,
      // customer (cadastro completo) tem precedência; senão cai no customerName solto.
      customer: input.customer,
      customerName: input.customer ? undefined : input.customerName?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao criar pedido de balcão (${res.status})`);
  return (await res.json()) as CounterOrderResponse;
}
