import { describe, expect, it } from 'vitest';
import { buildFrontSecurityHeaders } from '../../front-security';

const PROD_ENV = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  NEXT_PUBLIC_SENTRY_DSN: 'https://public@o1.ingest.sentry.io/1',
  MOLHO_ASSETS_ORIGIN: 'https://assets.exampleusercontent.com',
};

describe('headers dos fronts', () => {
  it('usa CSP em enforcement e remove unsafe-eval do build implantado', () => {
    const headers = buildFrontSecurityHeaders({ kind: 'storefront', env: PROD_ENV });
    const csp = headers.find((header) => header.key === 'Content-Security-Policy');
    expect(csp?.value).toContain("frame-ancestors 'none'");
    expect(csp?.value).toContain("object-src 'none'");
    expect(csp?.value).not.toContain("'unsafe-eval'");
    expect(headers.some((header) => header.key === 'Content-Security-Policy-Report-Only')).toBe(false);
  });

  it('só liga report-only e HSTS por configuração explícita', () => {
    const headers = buildFrontSecurityHeaders({
      kind: 'storefront',
      env: { ...PROD_ENV, MOLHO_CSP_REPORT_ONLY: 'true', MOLHO_ENABLE_HSTS: 'true' },
    });
    expect(headers.some((header) => header.key === 'Content-Security-Policy-Report-Only')).toBe(true);
    expect(headers.find((header) => header.key === 'Strict-Transport-Security')?.value).toBe('max-age=15552000');
  });

  it('falha cedo se Sentry/assets não foram configurados no deployment produtivo', () => {
    expect(() => buildFrontSecurityHeaders({ kind: 'storefront', env: { VERCEL_ENV: 'production' } })).toThrow();
  });
});
