import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { storefrontPublicBaseUrl } from '../lib/site-url';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const slug = requestHeaders.get('x-molho-slug');
  if (!slug) return [];
  const publicBaseUrl = storefrontPublicBaseUrl(requestHeaders.get('x-molho-public-base-url'), slug);
  return [
    {
      url: publicBaseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];
}
