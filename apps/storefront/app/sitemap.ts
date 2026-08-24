import type { MetadataRoute } from 'next';

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? 'https://molho.vercel.app';

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
