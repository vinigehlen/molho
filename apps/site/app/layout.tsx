import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { THEMES } from '@molho/ui';
import { CookieConsent } from '../components/cookie-consent';
import { SiteAnalytics } from '../components/site-analytics';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

const DESCRICAO =
  'Cardápio digital, pedido com PIX e gestor de pedidos pro seu delivery ou restaurante, sem comissão por venda. Chega de anotar pedido no WhatsApp.';

export const metadata: Metadata = {
  metadataBase: new URL('https://molho.live'),
  title: 'Molho: cardápio digital, PIX e delivery sem comissão',
  description: DESCRICAO,
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/app-icon-180.png',
  },
  openGraph: {
    title: 'Molho',
    description: DESCRICAO,
    images: ['/og-image-1200x630.png'],
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Molho: cardápio digital, PIX e delivery sem comissão',
    description: DESCRICAO,
    images: ['/og-image-1200x630.png'],
  },
};

// Sourced do token único (packages/ui/themes.ts), nunca hex à mão — o lint de
// hex hardcoded (eslint.config.mjs, doc de marca §4) bloqueia string literal.
export const viewport: Viewport = {
  themeColor: THEMES.brasa.brand,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body className="bg-cream [font-family:var(--font-inter)] text-text antialiased">
        {children}
        <SiteAnalytics />
        <CookieConsent />
      </body>
    </html>
  );
}
