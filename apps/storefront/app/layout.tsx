import type { Metadata, Viewport } from 'next';
import './globals.css';

const DESCRICAO = 'Cardápio digital, PDV e delivery para o seu restaurante. Sem taxa por venda.';

export const metadata: Metadata = {
  metadataBase: new URL('https://molho.vercel.app'),
  title: { default: 'Molho', template: '%s · Molho' },
  description: DESCRICAO,
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/app-icon-180.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    title: 'Molho',
    description: DESCRICAO,
    images: ['/og-image-1200x630.png'],
    locale: 'pt_BR',
    type: 'website',
  },
};

export const viewport: Viewport = {
  // Tema Roxo é o default da plataforma (docs/04-brand-design-system.md §3.2).
  // O tenant sobrescreve o bloco --brand-* em runtime a partir do Épico 13b;
  // até lá, todo storefront nasce roxo.
  //
  // Hex literal aqui não é violação do design system: <meta name="theme-color">
  // é lido pelo chrome do navegador antes de qualquer CSS carregar, então não
  // existe var(--brand) para consumir neste contexto — é a mesma cor
  // (--purple-500), só que num lugar que não entende CSS custom property.
  // eslint-disable-next-line no-restricted-syntax
  themeColor: '#820AD1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-bg font-sans text-text antialiased">{children}</body>
    </html>
  );
}
