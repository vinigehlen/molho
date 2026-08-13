import { cache } from 'react';
import { type StorefrontPayload, storefrontPayloadSchema } from '@molho/contracts';

/**
 * Importa @molho/contracts. SÓ pode ser chamado de Server Component (layout,
 * page) — nunca de um arquivo `'use client'`. Ver o comentário longo em
 * `app/home-placeholder.tsx` sobre por quê: o webpack do `next dev` injeta
 * boilerplate de Fast Refresh no CommonJS compilado de contracts quando o
 * import acontece dentro do grafo do bundle cliente, e quebra em runtime.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

/**
 * `cache()` do React garante UMA busca por slug por requisição, não importa
 * quantos componentes da árvore chamem esta função (root layout pro tema,
 * `[slug]/layout.tsx` pro 404, `[slug]/page.tsx` pro conteúdo) — sem isto,
 * montar uma página do storefront custaria 2-3 round-trips pra API pra pedir
 * exatamente o mesmo payload.
 *
 * Devolve `null` pra QUALQUER resposta não-200 (loja inexistente, módulo
 * `channel.storefront` desligado, erro de rede) ou payload que não bate com
 * o contrato — nunca lança. Quem chama decide o que fazer: `notFound()` na
 * página, ou cair no tema padrão Roxo no layout raiz. Uma falha aqui não
 * pode derrubar o app inteiro numa página que só precisa do tema pra pintar
 * o `<html>`.
 */
export const getStorefront = cache(async (slug: string): Promise<StorefrontPayload | null> => {
  const url = `${API_URL}/v1/store/${encodeURIComponent(slug)}`;
  // TEMPORÁRIO (debug do 404 em staging) — remover depois de confirmar qual
  // dos 3 branches abaixo está devolvendo null. Loga em runtime log da
  // Vercel (Server Component, roda no servidor).
  console.log('[getStorefront:debug] API_URL =', API_URL, '| url =', url);

  let response: Response;
  try {
    response = await fetch(url, {
      // Mesma janela de 30s que a API já promete na borda (Cache-Control
      // s-maxage=30, Épico 5 commit 2) — o Next não tem por que cachear por
      // mais tempo do que a própria API considera fresco.
      next: { revalidate: 30 },
    });
  } catch (err) {
    console.log('[getStorefront:debug] fetch THROW —', err);
    return null;
  }

  console.log('[getStorefront:debug] status =', response.status, response.statusText);
  if (!response.ok) return null;

  const body = await response.json();
  const parsed = storefrontPayloadSchema.safeParse(body);
  if (!parsed.success) {
    console.log('[getStorefront:debug] safeParse FALHOU —', JSON.stringify(parsed.error.issues));
  }
  return parsed.success ? parsed.data : null;
});
