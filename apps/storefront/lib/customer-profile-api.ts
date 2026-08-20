import {
  customerOrderSummaryListSchema,
  customerProfileAddressSchema,
  customerProfileSchema,
  type CreateCustomerProfileAddressInput,
  type CustomerOrderSummary,
  type CustomerProfile,
  type CustomerProfileAddress,
  type UpdateCustomerProfileAddressInput,
  type UpdateCustomerProfileInput,
} from '@molho/contracts';
import { z } from 'zod';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const addressListSchema = z.array(customerProfileAddressSchema);

export class CustomerProfileUnauthorizedError extends Error {}
export class CustomerProfileConflictError extends Error {}

async function request<T>(slug: string, token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/v1/store/${encodeURIComponent(slug)}/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 401) throw new CustomerProfileUnauthorizedError('Sua sessão expirou.');
  if (response.status === 409) throw new CustomerProfileConflictError('Esses dados mudaram em outra sessão.');
  if (!response.ok) throw new Error('Não deu pra carregar sua conta agora.');
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getCustomerProfile(slug: string, token: string): Promise<CustomerProfile> {
  return customerProfileSchema.parse(await request(slug, token, ''));
}

export async function updateCustomerProfile(slug: string, token: string, input: UpdateCustomerProfileInput) {
  return customerProfileSchema.parse(
    await request(slug, token, '', { method: 'PATCH', body: JSON.stringify(input) }),
  );
}

export async function listCustomerAddresses(slug: string, token: string): Promise<CustomerProfileAddress[]> {
  return addressListSchema.parse(await request(slug, token, '/addresses'));
}

export async function createCustomerAddress(slug: string, token: string, input: CreateCustomerProfileAddressInput) {
  return customerProfileAddressSchema.parse(
    await request(slug, token, '/addresses', { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function updateCustomerAddress(
  slug: string,
  token: string,
  addressId: string,
  input: UpdateCustomerProfileAddressInput,
) {
  return customerProfileAddressSchema.parse(
    await request(slug, token, `/addresses/${encodeURIComponent(addressId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteCustomerAddress(
  slug: string,
  token: string,
  addressId: string,
  version: number,
): Promise<void> {
  await request<void>(slug, token, `/addresses/${encodeURIComponent(addressId)}?version=${version}`, {
    method: 'DELETE',
  });
}

export async function listCustomerOrders(slug: string, token: string): Promise<CustomerOrderSummary[]> {
  return customerOrderSummaryListSchema.parse(await request(slug, token, '/orders'));
}
