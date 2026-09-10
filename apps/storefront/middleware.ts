import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseAuthority, publicBaseUrl, resolveTenant, storefrontRoutingConfig } from './lib/host-routing';

const GLOBAL_PATHS = new Set([
  '/favicon.svg',
  '/favicon-16.png',
  '/favicon-32.png',
  '/app-icon-180.png',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/app-icon-maskable-512.png',
  '/robots.txt',
  '/sitemap.xml',
]);

function requestAuthority(request: NextRequest): string | null {
  // A Vercel sobrescreve estes headers; fora dela, só `Host` é considerado.
  if (process.env.VERCEL === '1') {
    return request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  }
  return request.headers.get('host');
}

function withTenantHeaders(request: NextRequest, slug: string, baseUrl: string, mode: string): Headers {
  const headers = new Headers(request.headers);
  headers.set('x-molho-slug', slug);
  headers.set('x-molho-public-base-url', baseUrl);
  headers.set('x-molho-routing-mode', mode);
  return headers;
}

export function middleware(request: NextRequest): NextResponse {
  const authority = requestAuthority(request);
  const resolution = resolveTenant(authority, request.nextUrl.pathname, storefrontRoutingConfig());
  if (!authority || !resolution) return new NextResponse(null, { status: 404 });

  const parsedAuthority = parseAuthority(authority);
  const baseUrl = publicBaseUrl(request.nextUrl.protocol, authority, resolution);
  if (!parsedAuthority || !baseUrl) return new NextResponse(null, { status: 404 });

  const requestHeaders = withTenantHeaders(request, resolution.slug, baseUrl, resolution.mode);
  const pathname = request.nextUrl.pathname;

  if (resolution.mode === 'path' || pathname.startsWith('/api/') || GLOBAL_PATHS.has(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/${resolution.slug}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
