import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Só @molho/ui: é fonte .ts crua, o Next precisa transpilá-la. Mesma nota
  // de apps/storefront/next.config.ts — o site não depende de @molho/contracts.
  transpilePackages: ['@molho/ui'],

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
