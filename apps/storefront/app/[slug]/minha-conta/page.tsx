import { notFound } from 'next/navigation';
import { getStorefront } from '../../../lib/storefront-api';
import { CustomerAccountView } from './customer-account-view';

export default async function MinhaContaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStorefront(slug);
  if (!store) notFound();
  return <CustomerAccountView slug={slug} storeName={store.store.name} />;
}
