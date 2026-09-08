/**
 * Origem pública do storefront. Uma fonte só — `metadataBase`, `sitemap`,
 * `robots` e o OG gerado precisam concordar, senão o link compartilhado
 * aponta pra um domínio e a imagem pra outro (era o bug: `metadataBase`
 * fixo em `molho.vercel.app` enquanto a loja vive em `staging-app.molho.live`
 * / `{slug}.molho.live`).
 *
 * Em produção com wildcard `*.molho.live` cada loja tem origem própria; até
 * lá o storefront roda num domínio só e o slug é rota (`/{slug}`), então uma
 * origem única basta. `NEXT_PUBLIC_STOREFRONT_URL` é o override por ambiente.
 */
export const STOREFRONT_URL = (process.env.NEXT_PUBLIC_STOREFRONT_URL || 'https://molho.vercel.app').replace(/\/+$/, '');
