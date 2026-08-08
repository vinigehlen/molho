import type { NextConfig } from 'next';

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
  // origem). HSTS NÃO entra até o TLS de molho.live estar validado — ver
  // apps/api/src/bootstrap/security-headers.ts.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
