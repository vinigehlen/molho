import { describe, expect, it } from 'vitest';
import { authHeaders } from './api-client';

describe('authHeaders', () => {
  it('com sessão: seta Bearer + X-Tenant-Id', () => {
    const h = authHeaders({ accessToken: 'tok', tenantId: 'tenant-1', userId: 'u1' });
    expect(h.get('authorization')).toBe('Bearer tok');
    expect(h.get('x-tenant-id')).toBe('tenant-1');
  });

  it('sem sessão: não seta headers de auth', () => {
    const h = authHeaders(null);
    expect(h.get('authorization')).toBeNull();
    expect(h.get('x-tenant-id')).toBeNull();
  });

  it('preserva headers base (ex.: content-type)', () => {
    const h = authHeaders({ accessToken: 't', tenantId: 'x', userId: 'u1' }, { 'content-type': 'application/json' });
    expect(h.get('content-type')).toBe('application/json');
    expect(h.get('authorization')).toBe('Bearer t');
  });
});
