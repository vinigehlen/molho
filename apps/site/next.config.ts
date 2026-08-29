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
  // Só @molho/ui: é fonte .ts crua, o Next precisa transpilá-la. Mesma nota
  // de apps/storefront/next.config.ts — o site não depende de @molho/contracts.
  transpilePackages: ['@molho/ui'],

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
