import { notFound } from 'next/navigation';
import { getStorefront } from '../../../../lib/storefront-api';
import { getOrderTracking } from '../../../../lib/order-tracking-api';
import { OrderTrackingView } from './tracking-view';

export default async function AcompanharPedidoPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const [store, tracking] = await Promise.all([getStorefront(slug), getOrderTracking(slug, token)]);
  if (!store || !tracking) notFound();

  return <OrderTrackingView slug={slug} token={token} storeName={store.store.name} initialTracking={tracking} />;
}
