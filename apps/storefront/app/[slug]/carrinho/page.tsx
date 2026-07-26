import { notFound } from 'next/navigation';
import { COPY } from '@molho/contracts';
import { getStorefront } from '../../../lib/storefront-api';
import { CartView } from './cart-view';

interface CarrinhoPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * `/{slug}/carrinho` — commit 8 (dead-end): mostra o que está no carrinho e
 * deixa ajustar quantidade/remover, mas não leva a lugar nenhum depois disso.
 * Checkout (endereço, pagamento) é Épico 7 do roadmap — não existe ainda, e
 * esta página não finge que existe.
 */
export default async function CarrinhoPage({ params }: CarrinhoPageProps) {
  const { slug } = await params;
  const store = await getStorefront(slug);
  if (!store) notFound();

  return (
    <CartView
      slug={slug}
      storeName={store.store.name}
      availablePaymentMethods={store.store.availablePaymentMethods}
      emptyTitle={COPY.storefront.carrinhoVazioTitulo}
      emptyBody={COPY.storefront.carrinhoVazioCorpo}
      emptyActionLabel={COPY.storefront.carrinhoVazioAcao}
    />
  );
}
