import type { NextConfig } from 'next';
import { buildFrontSecurityHeaders } from '../front-security';
import { internalApiOrigin } from './lib/api-origin';
import { storefrontRoutingConfig } from './lib/host-routing';

// Avaliado no carregamento do next.config para o deployment falhar antes do build.
internalApiOrigin();
storefrontRoutingConfig();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SENTRY_RELEASE:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? '',
  },
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

  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildFrontSecurityHeaders({ kind: 'storefront' }),
      },
    ];
  },
};

export default nextConfig;
