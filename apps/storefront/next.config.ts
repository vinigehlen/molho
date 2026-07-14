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
};

export default nextConfig;
