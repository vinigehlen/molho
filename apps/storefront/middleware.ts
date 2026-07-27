import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Segmentos de topo que NUNCA são slug de tenant — rotas globais do
 * storefront. Cresce conforme rotas assim nascem (ex.: `/carrinho`, Épico 5
 * commit 8).
 */
const ROTAS_RESERVADAS = new Set<string>([]);

/**
 * Resolve o tenant a partir da URL. É a ÚNICA função que sabe COMO uma
 * requisição vira slug hoje — path (`molho.vercel.app/{slug}`, CLAUDE.md
 * "infra ativa"). Trocar pra subdomínio (`{slug}.molho.live`, produção
 * futura) é editar só esta função; nenhum layout muda ("a lógica de
 * resolução de tenant deve ser configurável para trocar sem refactor").
 */
export function resolveSlugFromRequest(request: NextRequest): string | null {
  const [primeiroSegmento] = request.nextUrl.pathname.slice(1).split('/');
  if (!primeiroSegmento || ROTAS_RESERVADAS.has(primeiroSegmento)) return null;
  return primeiroSegmento;
}

/**
 * Repassa o slug resolvido pro Server Component via header — é o jeito
 * documentado do Next.js de um layout RAIZ (que não recebe `params` de rota
 * nenhuma) descobrir algo específico da URL da requisição. O root layout
 * usa isso pra injetar o tema do tenant no `<html>` (não dá pra fazer isso
 * de dentro de `[slug]/layout.tsx`: só o layout raiz pode renderizar
 * `<html>`/`<body>`).
 */
export function middleware(request: NextRequest): NextResponse {
  const slug = resolveSlugFromRequest(request);
  if (!slug) return NextResponse.next();

  const headers = new Headers(request.headers);
  headers.set('x-molho-slug', slug);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Todas as rotas, exceto assets do Next e qualquer caminho com extensão de
  // arquivo (favicon, manifest, ícones, og-image) — middleware nelas seria
  // custo sem propósito, não têm tenant nenhum.
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
