import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@molho/ui', '@molho/contracts'],
};

export default nextConfig;
