import { NextResponse } from 'next/server';
import { getTheme } from '@molho/ui';
import { getStorefront } from '../../../lib/storefront-api';

/**
 * Manifest PWA por loja (Épico 13b) — "Adicionar à tela inicial" usa
 * logo/nome/cor DESTA loja, não do Molho.
 *
 * Não dá pra usar a convenção de arquivo especial `manifest.ts` do App
 * Router aqui: ela só existe na RAIZ (`app/manifest.ts` → `/manifest.webmanifest`),
 * sem suporte a segmento dinâmico — achado tentando `app/[slug]/manifest.ts`,
 * que o Next simplesmente ignora (nenhuma rota registrada, nenhum erro).
 * Route Handler com esse mesmo nome de pasta resolve igual, com `params`
 * como qualquer rota dinâmica.
 *
 * Sem logo ainda: `icons` vem vazio — nunca quebra a instalação, só fica
 * sem ícone customizado (cai no ícone default do navegador).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const store = await getStorefront(slug);
  const theme = getTheme(store?.store.themeKey);

  return NextResponse.json(
    {
      name: store?.store.name ?? 'Molho',
      short_name: store?.store.name ?? 'Molho',
      description: store?.store.publicDescription ?? undefined,
      start_url: `/${slug}`,
      display: 'standalone',
      // eslint-disable-next-line no-restricted-syntax -- manifest PWA exige hex literal (JSON servido ao navegador, não Tailwind); sem token possível aqui.
      background_color: '#FFFFFF',
      theme_color: theme.brand,
      // ponytail: `sizes` é nominal, não a dimensão real do arquivo (o
      // upload do wizard não recorta/redimensiona pra ícone PWA) — alguns
      // navegadores podem ignorar o ícone se a foto não for de fato
      // quadrada. Upgrade: gerar os tamanhos de verdade no upload se algum
      // lojista reclamar.
      icons: store?.store.logoImageUrl
        ? [
            { src: store.store.logoImageUrl, sizes: '192x192', type: 'image/png' },
            { src: store.store.logoImageUrl, sizes: '512x512', type: 'image/png' },
          ]
        : [],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
}
