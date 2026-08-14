import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, authHeaders } from './api-client';
import { clearStaffSession, setStaffSession } from './staff-session';

const mocks = vi.hoisted(() => ({ refreshStaffSession: vi.fn() }));
vi.mock('./staff-auth', () => ({ refreshStaffSession: mocks.refreshStaffSession }));

beforeEach(() => {
  clearStaffSession();
  vi.clearAllMocks();
});

afterEach(() => vi.unstubAllGlobals());

describe('authHeaders', () => {
  it('com sessão: seta Bearer + X-Tenant-Id', () => {
    const h = authHeaders({ accessToken: 'tok', tenantId: 'tenant-1', tenantName: 'Loja', userId: 'u1' });
    expect(h.get('authorization')).toBe('Bearer tok');
    expect(h.get('x-tenant-id')).toBe('tenant-1');
  });

  it('sem sessão: não seta headers de auth', () => {
    const h = authHeaders(null);
    expect(h.get('authorization')).toBeNull();
    expect(h.get('x-tenant-id')).toBeNull();
  });

  it('preserva headers base (ex.: content-type)', () => {
    const h = authHeaders(
      { accessToken: 't', tenantId: 'x', tenantName: 'Loja', userId: 'u1' },
      { 'content-type': 'application/json' },
    );
    expect(h.get('content-type')).toBe('application/json');
    expect(h.get('authorization')).toBe('Bearer t');
  });

  it('em 401 renova uma vez e repete a chamada com o access novo', async () => {
    setStaffSession({ accessToken: 'old', tenantId: 'tenant-1', tenantName: 'Loja', userId: 'u1' });
    mocks.refreshStaffSession.mockImplementation(async () => {
      const session = { accessToken: 'new', tenantId: 'tenant-1', tenantName: 'Loja', userId: 'u1' };
      setStaffSession(session);
      return session;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/v1/admin/orders')).resolves.toHaveProperty('status', 200);
    expect(mocks.refreshStaffSession).toHaveBeenCalledOnce();
    expect(((fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Headers).get('authorization')).toBe('Bearer new');
  });
});
