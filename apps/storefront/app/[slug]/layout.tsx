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
  // Descrição do lojista (Épico 13b, wizard) tem prioridade — é a que ele
  // escreveu de propósito pra aparecer quando compartilha o link. Sem ela,
  // cai no texto genérico de sempre.
  const description =
    store.store.publicDescription ??
    [
      `Peça no cardápio digital do ${store.store.name}`,
      store.store.addressText ? `em ${store.store.addressText}` : null,
      'com entrega, retirada e pagamento pelo Molho.',
    ]
      .filter(Boolean)
      .join(' ');
  const ogImage = store.store.coverImageUrl ?? '/og-image-1200x630.png';

  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    // Favicon por loja (Épico 13b) — `icons` do Metadata API é a forma
    // suportada de trocar o ícone da aba por rota dinâmica sem precisar de
    // um arquivo `icon.tsx` próprio; sem logo, cai no favicon padrão do
    // Molho (herdado do layout raiz, `icons` aqui fica ausente de propósito).
    ...(store.store.logoImageUrl ? { icons: { icon: store.store.logoImageUrl } } : {}),
    manifest: `/${slug}/manifest.webmanifest`,
    openGraph: {
      title,
      description,
      url: `/${slug}`,
      images: [ogImage],
      locale: 'pt_BR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
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
