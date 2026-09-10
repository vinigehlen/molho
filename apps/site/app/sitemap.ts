import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/urls';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages = ['', '/privacidade', '/termos'];
  return pages.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.6,
  }));
}
