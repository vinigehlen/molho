import type { NextConfig } from 'next';
import { buildFrontSecurityHeaders } from '../front-security';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SENTRY_RELEASE:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? '',
  },
  // Só @molho/ui: é fonte .ts crua, o Next precisa transpilá-la. Mesma nota
  // de apps/storefront/next.config.ts — o site não depende de @molho/contracts.
  transpilePackages: ['@molho/ui'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildFrontSecurityHeaders({ kind: 'site' }),
      },
    ];
  },
};

export default nextConfig;
