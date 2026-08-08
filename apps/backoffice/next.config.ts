import path from 'node:path';
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

  // Em produção, SUBSTITUI o módulo `dev-only-auth` (atalho de login só-dev,
  // débito docs/07) por um stub vazio. O import dinâmico do Next emite o chunk
  // pro disco mesmo com o call site morto — então dead-code no call site não
  // basta pra tirar o código que obtém OTP/JWT do bundle. Esta substituição
  // garante que o código real simplesmente NÃO É empacotado em prod. Removível
  // junto com o stub quando o Épico 9b entrar.
  webpack: (config, { dev, webpack }) => {
    if (!dev) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /dev-only-auth$/,
          path.resolve(__dirname, 'lib/dev-only-auth.prod-stub.ts'),
        ),
      );
    }
    return config;
  },
};

export default nextConfig;
