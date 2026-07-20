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
  return store ? { title: store.store.name } : {};
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
