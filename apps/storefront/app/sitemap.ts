import type { MetadataRoute } from 'next';
import { STOREFRONT_URL } from '../lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: STOREFRONT_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];
}
