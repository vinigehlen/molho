import { notFound } from 'next/navigation';
import { getOrderTrackingFromApi, getStorefront } from '../../../../lib/storefront-api';
import { storefrontPublicPathPrefix, storefrontUrlForRequest } from '../../../../lib/site-url';
import { OrderTrackingView } from './tracking-view';

export default async function AcompanharPedidoPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const [store, tracking, publicBaseUrl] = await Promise.all([
    getStorefront(slug),
    getOrderTrackingFromApi(slug, token),
    storefrontUrlForRequest(slug),
  ]);
  if (!store || !tracking) notFound();

  return (
    <OrderTrackingView
      slug={slug}
      basePath={storefrontPublicPathPrefix(publicBaseUrl)}
      token={token}
      storeName={store.store.name}
      initialTracking={tracking}
    />
  );
}
