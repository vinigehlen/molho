import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { getTheme, themeToCssVars, type Theme } from '@molho/ui';
import './globals.css';
import { getStorefront } from '../lib/storefront-api';

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

/**
 * Resolve o tema do TENANT da requisição atual. Compartilhado entre
 * `generateViewport` (theme-color do navegador) e `RootLayout` (CSS vars do
 * `<html>`) — as duas leituras nunca podem divergir, e as duas dependem da
 * mesma coisa: o slug que o middleware escreveu no header `x-molho-slug` a
 * partir da URL (`middleware.ts` é a única peça que sabe como uma
 * requisição vira tenant).
 *
 * Sem slug (rota global, ex.: a Home bare `/`), cai no tema Brasa padrão —
 * `getTheme(undefined)` já resolve isso sozinho. `getStorefront` é
 * `React.cache()`-ado, então chamar isto duas vezes por requisição (viewport
 * + layout) não dobra o round-trip pra API.
 */
async function resolveTenantTheme(): Promise<Theme> {
  const slug = (await headers()).get('x-molho-slug');
  const store = slug ? await getStorefront(slug) : null;
  return getTheme(store?.store.themeKey);
}

/**
 * theme-color dinâmico: o chrome do navegador mobile (barra de status/
 * endereço) acompanha a cor do tenant, não só o conteúdo da página. Mesma
 * fonte que injeta as CSS vars no `<html>` — nunca diverge.
 *
 * Hex (não `var(--brand)`) não é violação do design system aqui: `<meta
 * name="theme-color">` é lido pelo chrome do navegador antes de qualquer CSS
 * carregar, não existe custom property pra consumir neste contexto.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = await resolveTenantTheme();
  return { themeColor: theme.brand };
}

/**
 * Injeta o tema do TENANT no `<html>` — só o layout raiz pode renderizar
 * `<html>`/`<body>` no App Router, então é aqui, e não em
 * `app/[slug]/layout.tsx`, que a troca de cor acontece.
 *
 * Var CSS no `<html>`, não num wrapper interno: conteúdo em portal (MoSheet,
 * usado a partir do Épico 5 commit 6/7) monta como filho direto de
 * `document.body`, fora de qualquer wrapper — só herda a cor certa se ela
 * estiver acima de `<body>` na árvore. Mesmo raciocínio documentado no
 * decorator de tema do Storybook (`packages/ui/.storybook/preview.tsx`).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cssVars = themeToCssVars(await resolveTenantTheme());

  return (
    <html lang="pt-BR" style={cssVars}>
      <body className="bg-bg font-sans text-text antialiased">{children}</body>
    </html>
  );
}
