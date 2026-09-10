import type { NextConfig } from 'next';
import { buildFrontSecurityHeaders } from '../front-security';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SENTRY_RELEASE:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? '',
  },
  // Só @molho/ui (fonte .ts crua). @molho/contracts é CommonJS já compilado
  // (dist/) e NÃO deve entrar aqui — ver o comentário em
  // apps/storefront/next.config.ts sobre o "import.meta" quebrando no dev.
  transpilePackages: ['@molho/ui'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildFrontSecurityHeaders({ kind: 'backoffice' }),
      },
    ];
  },
};

export default nextConfig;
