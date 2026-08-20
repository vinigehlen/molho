import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CustomerProfileConflictError,
  CustomerProfileUnauthorizedError,
  deleteCustomerAddress,
  getCustomerProfile,
  updateCustomerProfile,
} from './customer-profile-api';

const profile = {
  id: '0193f1a0-0000-7000-8000-000000000001',
  name: 'Bia',
  phoneMasked: '(51) *****-1234',
  emailMasked: null,
  phoneVerified: true,
  version: 2,
};

describe('customer-profile-api', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('envia o token e valida o perfil recebido', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(profile)));
    await expect(getCustomerProfile('minha loja', 'token-x')).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/store/minha%20loja/me'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-x' }) }),
    );
  });

  it('faz PATCH com optimistic locking', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ...profile, name: 'Beatriz', version: 3 })));
    await updateCustomerProfile('loja', 'token-x', { name: 'Beatriz', version: 2 });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ name: 'Beatriz', version: 2 }),
    }));
  });

  it('distingue sessão expirada e conflito', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(getCustomerProfile('loja', 'token-x')).rejects.toBeInstanceOf(CustomerProfileUnauthorizedError);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 409 }));
    await expect(updateCustomerProfile('loja', 'token-x', { name: 'Bia', version: 1 })).rejects.toBeInstanceOf(CustomerProfileConflictError);
  });

  it('aceita a resposta vazia da exclusão', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteCustomerAddress('loja', 'token-x', 'address-1', 4)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/addresses/address-1?version=4'), expect.objectContaining({ method: 'DELETE' }));
  });
});
