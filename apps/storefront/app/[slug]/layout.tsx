import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStorefront } from '../../lib/storefront-api';

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStorefront(slug);
  if (!store) return {};

  const title = store.store.name;
  const descriptionParts = [
    `Peça no cardápio digital do ${store.store.name}`,
    store.store.addressText ? `em ${store.store.addressText}` : null,
    'com entrega, retirada e pagamento pelo Molho.',
  ].filter(Boolean);
  const description = descriptionParts.join(' ');

  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      title,
      description,
      url: `/${slug}`,
      images: ['/og-image-1200x630.png'],
      locale: 'pt_BR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-image-1200x630.png'],
    },
  };
}

/**
 * Camada de tenant do storefront (`/{slug}`). A cor já foi injetada pelo
 * layout raiz — aqui só falta garantir que a loja existe antes de deixar
 * qualquer página filha renderizar.
 *
 * `notFound()` cobre tanto "slug não existe" quanto "módulo
 * channel.storefront desligado" (a API distingue 404 de 403 — ver
 * `apps/api/src/storefront/public-store.controller.ts` — mas o storefront
 * público não tem por que expor essa diferença pra quem só bateu num link
 * errado ou numa loja temporariamente fora do ar).
 */
export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { slug } = await params;
  const store = await getStorefront(slug);

  if (!store) notFound();

  return <>{children}</>;
}
