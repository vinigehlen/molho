import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TOKEN_HEADER } from './store-api-path';
import { proxyStorefrontRequest, STOREFRONT_BFF_MAX_BODY_BYTES } from './store-bff';

const ENV = { MOLHO_API_INTERNAL_URL: 'https://molho-api.fly.dev' };

function request(path: string, init: RequestInit = {}, slug = 'cabanhas-bbq') {
  const headers = new Headers(init.headers);
  headers.set('x-molho-slug', slug);
  return new Request(`https://cabanhas-bbq.molho.live${path}`, { ...init, headers });
}

afterEach(() => vi.unstubAllGlobals());

describe('BFF público da storefront', () => {
  it('encaminha catálogo allowlisted para a API server-only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ store: {}, categories: [] }, { headers: { 'Cache-Control': 'public, s-maxage=30' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxyStorefrontRequest(
      request('/api/store/cabanhas-bbq?catalog=offers'),
      ['cabanhas-bbq'],
      ENV,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://molho-api.fly.dev/v1/store/cabanhas-bbq?catalog=offers');
  });

  it('converte apenas o token de cliente e nunca encaminha cookie ou Authorization recebido', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'customer-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const incoming = request('/api/store/cabanhas-bbq/me', {
      headers: {
        Authorization: 'Bearer admin-token',
        Cookie: '__Host-molho_stream=staff-cookie',
        [CUSTOMER_TOKEN_HEADER]: 'customer.token.1234567890',
      },
    });

    const response = await proxyStorefrontRequest(incoming, ['cabanhas-bbq', 'me'], ENV);
    expect(response.status).toBe(200);

    const upstreamHeaders = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Headers;
    expect(upstreamHeaders.get('authorization')).toBe('Bearer customer.token.1234567890');
    expect(upstreamHeaders.get('cookie')).toBeNull();
  });

  it.each([
    [['cabanhas-bbq', 'admin', 'orders'], '/api/store/cabanhas-bbq/admin/orders'],
    [['cabanhas-bbq', 'platform'], '/api/store/cabanhas-bbq/platform'],
    [['cabanhas-bbq', '..', 'admin'], '/api/store/cabanhas-bbq/%2e%2e/admin'],
    [['outra-loja'], '/api/store/outra-loja'],
  ])('nega namespace, traversal ou slug diferente do host', async (segments, path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await proxyStorefrontRequest(request(path), segments, ENV);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejeita payload acima do limite antes da API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await proxyStorefrontRequest(
      request('/api/store/cabanhas-bbq/checkout/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'x'.repeat(STOREFRONT_BFF_MAX_BODY_BYTES) }),
      }),
      ['cabanhas-bbq', 'checkout', 'orders'],
      ENV,
    );
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('interrompe um body em streaming assim que ele ultrapassa o limite', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(128 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const incoming = request('/api/store/cabanhas-bbq/checkout/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);

    const response = await proxyStorefrontRequest(incoming, ['cabanhas-bbq', 'checkout', 'orders'], ENV);

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('transforma timeout/falha da API em erro uniforme sem detalhes internos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED secret-host')));
    const response = await proxyStorefrontRequest(request('/api/store/cabanhas-bbq'), ['cabanhas-bbq'], ENV);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'storefront_api_unavailable',
      message: 'Não deu pra falar com a loja agora. Tenta de novo em instantes.',
    });
  });

  it('só preserva IP do header sobrescrito pela Vercel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ withinZone: false }));
    vi.stubGlobal('fetch', fetchMock);
    const incoming = request('/api/store/cabanhas-bbq/delivery-match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '9.9.9.9',
        'X-Vercel-Forwarded-For': '203.0.113.8',
      },
      body: '{}',
    });
    await proxyStorefrontRequest(incoming, ['cabanhas-bbq', 'delivery-match'], { ...ENV, VERCEL: '1' });
    const upstreamHeaders = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Headers;
    expect(upstreamHeaders.get('x-forwarded-for')).toBe('203.0.113.8');
  });
});
