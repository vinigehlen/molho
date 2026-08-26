import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Molho — Painel', template: '%s · Painel Molho' },
  description: 'Painel do lojista e super-admin do Molho.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
  },
  // Sem PWA aqui de propósito: o backoffice é ferramenta de PC, não instala
  // no celular do cliente final. Sem manifest, sem ícones de app.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Backoffice é sempre vermelho Brasa Molho — não existe seletor de tema aqui
    // (§6.2: white-label é só do storefront). tokens.css entra puro, sem
    // nenhum override de --brand-*.
    <html lang="pt-BR">
      <body className="bg-bg font-sans text-text antialiased">{children}</body>
    </html>
  );
}
