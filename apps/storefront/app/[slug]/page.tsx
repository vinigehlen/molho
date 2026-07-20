import { notFound } from 'next/navigation';
import { COPY, t } from '@molho/contracts';
import { MoEmptyState } from '@molho/ui';
import { getStorefront } from '../../lib/storefront-api';

interface TenantHomePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Placeholder do commit 5 (layout + tema): prova que o payload da loja
 * chegou até a página (o nome real no título) sem ainda montar o cardápio —
 * isso é o commit 6 (header, categorias sticky, grid de produtos).
 *
 * `getStorefront` já rodou em `[slug]/layout.tsx` (que faz `notFound()` se
 * vier `null`) — a chamada aqui é cache hit garantido (`React.cache()`), não
 * um segundo round-trip. O `if (!store)` é só pra TS: o layout já filtrou em
 * runtime, mas o tipo de retorno não carrega essa garantia entre componentes.
 */
export default async function TenantHomePage({ params }: TenantHomePageProps) {
  const { slug } = await params;
  const store = await getStorefront(slug);
  if (!store) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <MoEmptyState title={store.store.name} description={t(COPY.sistema.emConstrucao, { epico: 5 })} />
    </main>
  );
}
