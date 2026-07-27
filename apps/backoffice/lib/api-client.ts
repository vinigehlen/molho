import { markReachable, markUnreachable } from './reachability';
import { getStaffSession, type StaffSession } from './staff-session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

/**
 * Headers de auth de staff: Bearer (escrita/leitura por header) + X-Tenant-Id.
 * Puro e testável — separado do fetch. Sem sessão, vai sem os headers (a rota
 * responde 401/403, o caller trata).
 */
export function authHeaders(session: StaffSession | null, base?: HeadersInit): Headers {
  const headers = new Headers(base);
  if (session) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
    headers.set('X-Tenant-Id', session.tenantId);
  }
  return headers;
}

/**
 * Fetch autenticado pro backoffice. `credentials: 'include'` porque o mesmo
 * host serve o cookie de stream (`arm` grava, o EventSource envia) — em
 * produção `app.`/`api.molho.live` são same-site. Escrita e leitura seguem
 * por HEADER (Bearer); o cookie é SÓ pro stream SSE (ver desenho do Épico 9).
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: authHeaders(getStaffSession(), init?.headers),
      credentials: 'include',
    });
    markReachable(); // respondeu (mesmo 4xx/5xx) = API alcançável
    return res;
  } catch (err) {
    markUnreachable(); // fetch LANÇOU = falha de rede real
    throw err;
  }
}

/** URL do stream SSE (o EventSource é aberto pelo consumidor realtime, não por apiFetch). */
export function streamUrl(tenantId: string): string {
  return `${API_URL}/v1/admin/orders/stream?tenant=${encodeURIComponent(tenantId)}`;
}

/** Grava o cookie de stream (o front chama antes de abrir o EventSource e após cada refresh). */
export async function armStream(): Promise<Response> {
  return apiFetch('/v1/admin/orders/stream/arm', { method: 'POST' });
}

/** Apaga o cookie de stream — chamar no logout ANTES de descartar o JWT (senão toma 401, docs/07). */
export async function disarmStream(): Promise<Response> {
  return apiFetch('/v1/admin/orders/stream/disarm', { method: 'POST' });
}
