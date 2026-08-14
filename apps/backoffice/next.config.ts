import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Só @molho/ui (fonte .ts crua). @molho/contracts é CommonJS já compilado
  // (dist/) e NÃO deve entrar aqui — ver o comentário em
  // apps/storefront/next.config.ts sobre o "import.meta" quebrando no dev.
  transpilePackages: ['@molho/ui'],

  // Headers constantes. `X-Frame-Options: DENY` importa aqui de verdade: o
  // backoffice move dinheiro (confirmar pagamento, cancelar pedido) e é o alvo
  // clássico de clickjacking. HSTS NÃO entra até o TLS de molho.live estar
  // validado — ver apps/api/src/bootstrap/security-headers.ts.
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
