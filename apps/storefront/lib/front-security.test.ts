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

  it('falha cedo se assets não foram configurados no deployment produtivo', () => {
    expect(() => buildFrontSecurityHeaders({ kind: 'storefront', env: { VERCEL_ENV: 'production' } })).toThrow();
  });

  it('falha cedo se o backoffice produtivo não tem origem de upload configurada', () => {
    expect(() =>
      buildFrontSecurityHeaders({ kind: 'backoffice', env: { VERCEL_ENV: 'production', MOLHO_ASSETS_ORIGIN: PROD_ENV.MOLHO_ASSETS_ORIGIN } }),
    ).toThrow();
  });

  it('backoffice inclui a origem de upload em connect-src (PUT pro R2 pré-assinado)', () => {
    const headers = buildFrontSecurityHeaders({
      kind: 'backoffice',
      env: { ...PROD_ENV, NEXT_PUBLIC_API_URL: 'https://api.exampleusercontent.com', MOLHO_UPLOAD_ORIGIN: 'https://minha-conta.r2.cloudflarestorage.com' },
    });
    const csp = headers.find((header) => header.key === 'Content-Security-Policy');
    expect(csp?.value).toContain('connect-src');
    expect(csp?.value).toContain('https://minha-conta.r2.cloudflarestorage.com');
  });

  it('storefront não exige origem de upload (não faz upload de imagem)', () => {
    expect(() => buildFrontSecurityHeaders({ kind: 'storefront', env: PROD_ENV })).not.toThrow();
  });

  it('permite RC produtivo sem Sentry no piloto', () => {
    const headers = buildFrontSecurityHeaders({
      kind: 'storefront',
      env: {
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        MOLHO_ASSETS_ORIGIN: 'https://assets.exampleusercontent.com',
      },
    });
    expect(headers.find((header) => header.key === 'Content-Security-Policy')?.value).not.toContain('sentry.io');
  });
});
