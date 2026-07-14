import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Só @molho/ui (fonte .ts crua). @molho/contracts é CommonJS já compilado
  // (dist/) e NÃO deve entrar aqui — ver o comentário em
  // apps/storefront/next.config.ts sobre o "import.meta" quebrando no dev.
  transpilePackages: ['@molho/ui'],
};

export default nextConfig;
