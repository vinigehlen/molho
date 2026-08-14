import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateStaffSession,
  fetchOtpChannel,
  logoutStaffSession,
  requestStaffOtp,
  refreshStaffSession,
  verifyStaffOtp,
  type StaffTenant,
} from './staff-auth';
import { clearStaffSession, getStaffSession } from './staff-session';

const TENANT: StaffTenant = {
  id: 'tenant-1',
  name: 'Cabanhas BBQ',
  slug: 'cabanhas-bbq',
  stores: [{ id: 'store-1', name: 'Cabanhas BBQ' }],
};

function jwt(sub: string): string {
  return `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`;
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  clearStaffSession();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => vi.unstubAllGlobals());

describe('staff-auth', () => {
  it('valida o canal recebido e traduz falha de rede sem expor Failed to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));

    await expect(fetchOtpChannel()).rejects.toThrow('Não foi possível carregar o login. Confira sua conexão.');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ channel: 'fax' })));
    await expect(fetchOtpChannel()).rejects.toThrow('A configuração do login veio inválida.');
  });

  it('traduz falha de rede ao pedir o OTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));

    await expect(requestStaffOtp('email', 'dono@restaurante.com.br')).rejects.toThrow(
      'Não foi possível enviar o código. Confira sua conexão.',
    );
  });

  it('verifica OTP com cookie e carrega somente os tenants permitidos', async () => {
    const accessToken = jwt('user-1');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ accessToken, user: { id: 'user-1', name: 'Dono' } }))
      .mockResolvedValueOnce(json({ tenants: [TENANT] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyStaffOtp('email', 'dono@restaurante.com.br', '123456');

    expect(result.tenants).toEqual([TENANT]);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ headers: { Authorization: `Bearer ${accessToken}` } }),
    );
  });

  it('deduplica refresh concorrente para não reutilizar o token rotativo', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const accessToken = jwt('user-2');
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/v1/auth/refresh')) {
        await gate;
        return json({ accessToken });
      }
      return json({ tenants: [TENANT] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = refreshStaffSession();
    const second = refreshStaffSession();
    release();

    expect(await first).toEqual(await second);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/v1/auth/refresh'))).toHaveLength(1);
    expect(getStaffSession()).toEqual({
      accessToken,
      tenantId: TENANT.id,
      tenantName: TENANT.name,
      userId: 'user-2',
    });
  });

  it('serializa a rotação entre abas com Web Locks quando disponível', async () => {
    const accessToken = jwt('user-lock');
    const lockRequest = vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback());
    vi.stubGlobal('navigator', { locks: { request: lockRequest } });
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(json({ accessToken }))
        .mockResolvedValueOnce(json({ tenants: [TENANT] })),
    );

    await refreshStaffSession();

    expect(lockRequest).toHaveBeenCalledWith('molho.staff-refresh', expect.any(Function));
  });

  it('só apaga a sessão local depois que o servidor confirma o logout', async () => {
    activateStaffSession(jwt('user-3'), TENANT);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await logoutStaffSession()).toBe(false);
    expect(getStaffSession()).not.toBeNull();
    expect(await logoutStaffSession()).toBe(true);
    expect(getStaffSession()).toBeNull();
  });
});
