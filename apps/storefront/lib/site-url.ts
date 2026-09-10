import { headers } from 'next/headers';

const LOCAL_STOREFRONT_ORIGIN = 'http://localhost:3000';
type Environment = Readonly<Record<string, string | undefined>>;

export function normalizePublicUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function storefrontPublicBaseUrl(
  requestHeader: string | null,
  slug: string,
  env: Environment = process.env,
): string {
  const fromRequest = normalizePublicUrl(requestHeader);
  if (fromRequest) return fromRequest;

  const configured = normalizePublicUrl(env.MOLHO_STOREFRONT_PUBLIC_URL);
  if (configured) return configured;

  if (env.VERCEL_ENV === 'production') {
    throw new Error('Produção exige a URL pública resolvida pelo host ou MOLHO_STOREFRONT_PUBLIC_URL.');
  }
  return `${LOCAL_STOREFRONT_ORIGIN}/${slug}`;
}

export function storefrontPublicPath(baseUrl: string): string {
  const pathname = new URL(baseUrl).pathname.replace(/\/$/, '');
  return pathname || '/';
}

export function storefrontPublicPathPrefix(baseUrl: string): string {
  const path = storefrontPublicPath(baseUrl);
  return path === '/' ? '' : path;
}

export async function storefrontUrlForRequest(slug: string): Promise<string> {
  const requestHeaders = await headers();
  return storefrontPublicBaseUrl(requestHeaders.get('x-molho-public-base-url'), slug);
}
