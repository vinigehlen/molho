import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api-client';
import { fetchMyStores } from './my-stores-api';
import { getStaffSession } from './staff-session';

vi.mock('./api-client', () => ({
  apiFetch: vi.fn(),
}));
vi.mock('./staff-session', () => ({
  getStaffSession: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);
const getStaffSessionMock = vi.mocked(getStaffSession);

function tenantsResponse(tenants: { id: string; stores: { id: string; name: string }[] }[]) {
  return new Response(JSON.stringify({ tenants }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('fetchMyStores', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    getStaffSessionMock.mockReset();
  });

  it('devolve só as lojas do tenant ATIVO da sessão, mesmo com outros tenants na resposta', async () => {
    getStaffSessionMock.mockReturnValue({ accessToken: 'x', tenantId: 'tenant-1', userId: 'u1', tenantName: 'A' });
    apiFetchMock.mockResolvedValueOnce(
      tenantsResponse([
        { id: 'tenant-1', stores: [{ id: 'store-1', name: 'Loja 1' }] },
        { id: 'tenant-2', stores: [{ id: 'store-2', name: 'Loja 2' }] },
      ]),
    );

    await expect(fetchMyStores()).resolves.toEqual([{ id: 'store-1', name: 'Loja 1' }]);
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/me/sessions/tenants');
  });

  it('sem sessão (tenantId indefinido): não acha tenant nenhum, devolve vazio', async () => {
    getStaffSessionMock.mockReturnValue(null);
    apiFetchMock.mockResolvedValueOnce(tenantsResponse([{ id: 'tenant-1', stores: [{ id: 's1', name: 'Loja' }] }]));

    await expect(fetchMyStores()).resolves.toEqual([]);
  });

  it('resposta não-ok: lança com o status', async () => {
    getStaffSessionMock.mockReturnValue({ accessToken: 'x', tenantId: 't1', userId: 'u1', tenantName: 'A' });
    apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(fetchMyStores()).rejects.toThrow('500');
  });
});
