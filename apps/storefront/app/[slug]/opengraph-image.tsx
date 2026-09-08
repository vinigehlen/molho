import { getStorefront } from '../../lib/storefront-api';
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from '../../lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Cardápio digital da loja';

/**
 * Card "fachada" da loja — capa + logo + nome + cor do tema. É o que o Next
 * injeta em `og:image` e `twitter:image` para `/{slug}` (a convenção de
 * arquivo tem precedência sobre qualquer imagem estática). Sem capa/logo,
 * `renderOgCard` degrada pro card sólido na cor do tenant.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = (await getStorefront(slug))?.store;

  return renderOgCard({
    name: store?.name ?? 'Molho',
    tagline: store?.publicDescription ?? store?.addressText ?? 'Peça pelo cardápio digital, com entrega e retirada.',
    themeKey: store?.themeKey,
    coverImageUrl: store?.coverImageUrl,
    logoImageUrl: store?.logoImageUrl,
  });
}
