import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from '../lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Molho — cardápio digital, PDV e delivery sem taxa por venda';

/** OG do `/` (a Home "crie sua loja"). Cada `/{slug}` tem o seu próprio. */
export default function Image() {
  return renderOgCard({
    name: 'Molho',
    tagline: 'Cardápio digital, PDV e delivery sem taxa por venda.',
    themeKey: 'brasa',
  });
}
