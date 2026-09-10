import type { Metadata } from 'next';

interface TenantMetadataStore {
  name: string;
  publicDescription: string | null;
  addressText: string | null;
  logoImageUrl: string | null;
}

export function buildTenantMetadata(store: TenantMetadataStore, publicBaseUrl: string): Metadata {
  const title = store.name;
  const description =
    store.publicDescription ??
    [
      `Peça no cardápio digital do ${store.name}`,
      store.addressText ? `em ${store.addressText}` : null,
      'com entrega, retirada e pagamento pelo Molho.',
    ]
      .filter(Boolean)
      .join(' ');

  return {
    metadataBase: new URL(publicBaseUrl),
    title,
    description,
    alternates: { canonical: publicBaseUrl },
    ...(store.logoImageUrl ? { icons: { icon: store.logoImageUrl } } : {}),
    manifest: `${publicBaseUrl}/manifest.webmanifest`,
    openGraph: {
      title,
      description,
      url: publicBaseUrl,
      images: [`${publicBaseUrl}/opengraph-image`],
      locale: 'pt_BR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${publicBaseUrl}/opengraph-image`],
    },
  };
}
