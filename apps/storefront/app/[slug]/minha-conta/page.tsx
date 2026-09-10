import { notFound } from 'next/navigation';
import { getStorefront } from '../../../lib/storefront-api';
import { storefrontPublicPathPrefix, storefrontUrlForRequest } from '../../../lib/site-url';
import { CustomerAccountView } from './customer-account-view';

export default async function MinhaContaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [store, publicBaseUrl] = await Promise.all([getStorefront(slug), storefrontUrlForRequest(slug)]);
  if (!store) notFound();
  return <CustomerAccountView slug={slug} basePath={storefrontPublicPathPrefix(publicBaseUrl)} storeName={store.store.name} />;
}
