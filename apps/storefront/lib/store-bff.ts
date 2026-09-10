import { isIP } from 'node:net';
import { internalApiOrigin } from './api-origin';
import { isValidStorefrontSlug } from './host-routing';
import { CUSTOMER_TOKEN_HEADER } from './store-api-path';

export const STOREFRONT_BFF_TIMEOUT_MS = 8_000;
export const STOREFRONT_BFF_MAX_BODY_BYTES = 256 * 1024;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type TokenPolicy = 'none' | 'optional' | 'required';
type Environment = Readonly<Record<string, string | undefined>>;

interface RouteRule {
  method: Method;
  pattern: readonly string[];
  token: TokenPolicy;
  cacheable?: boolean;
}

const ID = ':id';
const PUBLIC_STORE_ROUTES: readonly RouteRule[] = [
  { method: 'GET', pattern: [], token: 'none', cacheable: true },
  { method: 'POST', pattern: ['delivery-match'], token: 'none' },
  { method: 'POST', pattern: ['checkout', 'revalidate'], token: 'none' },
  { method: 'POST', pattern: ['checkout', 'orders'], token: 'optional' },
  { method: 'POST', pattern: ['auth', 'otp', 'request'], token: 'none' },
  { method: 'POST', pattern: ['auth', 'otp', 'verify'], token: 'none' },
  { method: 'GET', pattern: ['me'], token: 'required' },
  { method: 'PATCH', pattern: ['me'], token: 'required' },
  { method: 'GET', pattern: ['me', 'addresses'], token: 'required' },
  { method: 'POST', pattern: ['me', 'addresses'], token: 'required' },
  { method: 'PATCH', pattern: ['me', 'addresses', ID], token: 'required' },
  { method: 'DELETE', pattern: ['me', 'addresses', ID], token: 'required' },
  { method: 'GET', pattern: ['me', 'orders'], token: 'required' },
  { method: 'GET', pattern: ['me', 'loyalty'], token: 'required' },
  { method: 'GET', pattern: ['me', 'loyalty', 'events'], token: 'required' },
  { method: 'POST', pattern: ['orders', ID, 'review'], token: 'required' },
  { method: 'GET', pattern: ['track', ID], token: 'none' },
  { method: 'POST', pattern: ['track', ID, 'review'], token: 'none' },
] as const;

function safeDynamicSegment(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

function findRule(method: string, suffix: string[]): RouteRule | null {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return null;
  return PUBLIC_STORE_ROUTES.find((rule) =>
    rule.method === method &&
    rule.pattern.length === suffix.length &&
    rule.pattern.every((expected, index) => expected === suffix[index] || (expected === ID && safeDynamicSegment(suffix[index]!)))
  ) ?? null;
}

function validQuery(rule: RouteRule, searchParams: URLSearchParams): boolean {
  const entries = [...searchParams.entries()];
  if (rule.pattern.length === 0 && rule.method === 'GET') {
    return entries.length === 0 || (entries.length === 1 && entries[0]![0] === 'catalog' && entries[0]![1] === 'offers');
  }
  if (rule.method === 'DELETE' && rule.pattern[0] === 'me' && rule.pattern[1] === 'addresses') {
    return entries.length === 1 && entries[0]![0] === 'version' && /^\d{1,10}$/.test(entries[0]![1]);
  }
  return entries.length === 0;
}

function jsonError(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function customerToken(request: Request): string | null {
  const token = request.headers.get(CUSTOMER_TOKEN_HEADER);
  return token && /^[A-Za-z0-9._~-]{16,4096}$/.test(token) ? token : null;
}

function vercelClientIp(request: Request, env: Environment): string | null {
  if (env.VERCEL !== '1') return null;
  const value = request.headers.get('x-vercel-forwarded-for');
  if (!value || value.includes(',') || !isIP(value)) return null;
  return value;
}

async function requestBody(request: Request): Promise<ArrayBuffer | null | 'too_large' | 'invalid_type'> {
  if (request.method === 'GET' || request.method === 'DELETE') return null;
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return 'invalid_type';

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > STOREFRONT_BFF_MAX_BODY_BYTES) return 'too_large';

  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > STOREFRONT_BFF_MAX_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // A resposta 413 independe de o cliente aceitar o cancelamento do stream.
      }
      return 'too_large';
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function responseHeaders(upstream: Response, cacheable: boolean): Headers {
  const headers = new Headers();
  for (const name of ['content-type', 'cache-control', 'etag', 'last-modified', 'retry-after']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!cacheable) headers.set('Cache-Control', 'no-store');
  return headers;
}

export async function proxyStorefrontRequest(
  request: Request,
  segments: string[],
  env: Environment = process.env,
): Promise<Response> {
  if (/%(?:2e|2f|5c)/i.test(new URL(request.url).pathname)) {
    return jsonError(404, 'route_not_found', 'Rota pública não encontrada.');
  }

  const [slug, ...suffix] = segments;
  const hostSlug = request.headers.get('x-molho-slug');
  if (!slug || !isValidStorefrontSlug(slug) || !hostSlug || slug !== hostSlug) {
    return jsonError(404, 'store_not_found', 'Loja não encontrada.');
  }

  const rule = findRule(request.method, suffix);
  const incomingUrl = new URL(request.url);
  if (!rule || !validQuery(rule, incomingUrl.searchParams)) {
    return jsonError(404, 'route_not_found', 'Rota pública não encontrada.');
  }

  const rawCustomerToken = request.headers.get(CUSTOMER_TOKEN_HEADER);
  const token = customerToken(request);
  if (rawCustomerToken && !token) return jsonError(400, 'invalid_token', 'Token de cliente inválido.');
  if (rule.token === 'required' && !token) return jsonError(401, 'unauthorized', 'Sua sessão expirou.');
  if (rule.token === 'none' && rawCustomerToken) {
    return jsonError(400, 'unexpected_token', 'Esta rota não aceita sessão de cliente.');
  }

  const body = await requestBody(request);
  if (body === 'too_large') return jsonError(413, 'payload_too_large', 'O pedido excede o limite permitido.');
  if (body === 'invalid_type') return jsonError(415, 'unsupported_media_type', 'Envie o corpo como application/json.');

  const upstreamHeaders = new Headers({ Accept: 'application/json' });
  if (body) upstreamHeaders.set('Content-Type', 'application/json');
  if (token && rule.token !== 'none') upstreamHeaders.set('Authorization', `Bearer ${token}`);
  const clientIp = vercelClientIp(request, env);
  if (clientIp) upstreamHeaders.set('X-Forwarded-For', clientIp);

  const upstreamUrl = new URL(`/v1/store/${encodeURIComponent(slug)}${suffix.length ? `/${suffix.map(encodeURIComponent).join('/')}` : ''}`, internalApiOrigin(env));
  upstreamUrl.search = incomingUrl.search;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: rule.method,
      headers: upstreamHeaders,
      body: body ?? undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(STOREFRONT_BFF_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    return jsonError(502, 'storefront_api_unavailable', 'Não deu pra falar com a loja agora. Tenta de novo em instantes.');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders(upstream, Boolean(rule.cacheable)),
  });
}
