import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pacotes do workspace são transpilados a partir do .ts fonte — nenhum
  // build separado é necessário para consumo via Next (diferente do Nest,
  // que precisa de dist/ compilado porque roda via require() puro).
  transpilePackages: ['@molho/ui', '@molho/contracts'],
};

export default nextConfig;
