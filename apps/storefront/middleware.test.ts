import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { middleware } from './middleware';

afterEach(() => vi.unstubAllEnvs());

function request(path = '/', host = 'cabanhas-bbq.molho.live', headers: Record<string, string> = {}) {
  vi.stubEnv('MOLHO_STOREFRONT_ROOT_DOMAIN', 'molho.live');
  return new NextRequest(`https://${host}${path}`, { headers: { host, ...headers } });
}

describe('middleware de tenant', () => {
  it('reescreve rota profunda internamente sem redirect público', () => {
    const response = middleware(request('/acompanhar/token-123'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://cabanhas-bbq.molho.live/cabanhas-bbq/acompanhar/token-123',
    );
  });

  it('mantém o BFF no namespace global e injeta o slug do host', () => {
    const response = middleware(request('/api/store/cabanhas-bbq/checkout/revalidate'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-molho-slug')).toBe('cabanhas-bbq');
  });

  it('ignora X-Forwarded-Host fora da Vercel', () => {
    const response = middleware(request('/', 'evil.test', { 'x-forwarded-host': 'cabanhas-bbq.molho.live' }));
    expect(response.status).toBe(404);
  });

  it('rejeita hosts reservados', () => {
    expect(middleware(request('/', 'app.molho.live')).status).toBe(404);
  });
});
