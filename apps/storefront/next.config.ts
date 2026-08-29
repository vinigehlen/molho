import type { NextConfig } from 'next';

const CSP_REPORT_ONLY =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://app.posthog.com https://*.posthog.com https://www.googletagmanager.com https://www.google-analytics.com; connect-src 'self' http://localhost:* https: ws: wss:; media-src 'self' blob: https:; form-action 'self'";

function securityHeaders() {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
  ];
  if (process.env.MOLHO_ENABLE_HSTS === 'true') {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' });
  }
  return headers;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Só @molho/ui: é fonte .ts crua, e o Next precisa transpilá-la (nenhum
  // build separado é necessário para consumo via bundler).
  //
  // @molho/contracts NÃO entra aqui — desde que ganhou build real (tsc →
  // dist/, CommonJS), listá-lo como transpilePackage fazia o webpack do
  // `next dev` injetar boilerplate de Fast Refresh (import.meta.webpackHot)
  // num arquivo que já é CommonJS compilado, e isso quebrava com "Cannot
  // use 'import.meta' outside a module" — só em dev (HMR), não em build de
  // produção. O CommonJS puro do dist já é consumido nativamente pelo
  // webpack, sem precisar de transpilação nenhuma.
  transpilePackages: ['@molho/ui'],

  // Headers constantes. `DENY` no frame porque o checkout é clicável e ninguém
  // embute o storefront hoje — se "cardápio embutido no site do lojista" virar
  // feature, é aqui que muda (o SAMEORIGIN não serviria: o site dele é outra
  // origem). HSTS é opt-in por env; CSP começa report-only pra não quebrar
  // hidratação/analytics antes de observar staging.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders(),
      },
    ];
  },
};

export default nextConfig;
