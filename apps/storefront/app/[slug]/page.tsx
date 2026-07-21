import { notFound } from 'next/navigation';
import { COPY } from '@molho/contracts';
import { MoEmptyState } from '@molho/ui';
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

  return (
    <TenantMenu
      slug={slug}
      storeName={store.store.name}
      greeting={COPY.storefront.saudacaoAnonima}
      categories={store.categories}
    />
  );
}
