export const CUSTOMER_TOKEN_HEADER = 'X-Molho-Customer-Token';

export function storeApiPath(slug: string, suffix = ''): string {
  return `/api/store/${encodeURIComponent(slug)}${suffix}`;
}
