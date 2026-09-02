import { notFound } from 'next/navigation';
import { COPY, t } from '@molho/contracts';
import { MoEmptyState } from '@molho/ui';
import { formatarHorarioCurto } from '../../lib/format-horario';
import { getStorefront } from '../../lib/storefront-api';
import { TenantMenu } from './tenant-menu';

interface TenantHomePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * `getStorefront` já rodou em `[slug]/layout.tsx` (que faz `notFound()` se
 * vier `null`) — a chamada aqui é cache hit garantido (`React.cache()`), não
 * um segundo round-trip. O `if (!store)` é só pra TS: o layout já filtrou em
 * runtime, mas o tipo de retorno não carrega essa garantia entre componentes.
 *
 * Duas respostas possíveis pra "loja existe, cardápio ainda não":
 * `categories: []` é estado válido e testado do lado da API (lojista que
 * ainda não cadastrou nada) — mostra o vazio aqui, sem tentar montar o
 * scroll-spy de `TenantMenu` sobre uma lista vazia.
 */
export default async function TenantHomePage({ params }: TenantHomePageProps) {
  const { slug } = await params;
  const store = await getStorefront(slug);
  if (!store) notFound();

  if (store.categories.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <MoEmptyState
          title={COPY.storefront.cardapioVazioTitulo}
          description={COPY.storefront.cardapioVazioCorpo}
        />
      </main>
    );
  }

  // Mensagem inteira montada aqui (Server Component, importa @molho/contracts
  // sem risco) — "loja fechada" não depende de nenhum estado do cliente, só
  // do payload que já veio pronto. TenantMenu recebe a string formatada,
  // nunca precisa de COPY/t em runtime pra este banner específico.
  const closedMessage = store.store.isOpenNow
    ? null
    : t(COPY.storefront.lojaFechada, {
        horario: store.store.nextOpensAt ? formatarHorarioCurto(store.store.nextOpensAt) : 'em breve',
      });

  return (
    <TenantMenu
      slug={slug}
      storeName={store.store.name}
      greeting={COPY.storefront.saudacaoAnonima}
      categories={store.categories}
      minOrderCents={store.store.minOrderCents}
      closedMessage={closedMessage}
      reviewsSummary={store.store.reviewsSummary}
    />
  );
}
