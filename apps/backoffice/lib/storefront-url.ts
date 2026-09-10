const STOREFRONT_ROOT_DOMAIN = 'molho.live';

export function storefrontUrl(slug: string): string {
  return `https://${slug}.${STOREFRONT_ROOT_DOMAIN}`;
}

export function storefrontDisplayUrl(slug: string): string {
  return `${slug}.${STOREFRONT_ROOT_DOMAIN}`;
}
