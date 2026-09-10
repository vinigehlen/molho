import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { storefrontPublicBaseUrl } from '../lib/site-url';

// Rota estática do Next (metadata route) — nunca chama a API, nunca toca
// Redis. Bot batendo em /robots.txt não consome o balde do
// StorefrontRateLimitGuard porque essa rota não existe no lado da API.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const slug = requestHeaders.get('x-molho-slug');
  if (!slug) return { rules: { userAgent: '*', disallow: '/' } };
  const publicBaseUrl = storefrontPublicBaseUrl(requestHeaders.get('x-molho-public-base-url'), slug);
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${new URL(publicBaseUrl).origin}/sitemap.xml`,
  };
}
