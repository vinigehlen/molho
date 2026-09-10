export function storefrontRoute(basePath: string, suffix = ''): string {
  const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/$/, '');
  const normalizedSuffix = suffix && !suffix.startsWith('/') ? `/${suffix}` : suffix;
  return `${normalizedBase}${normalizedSuffix}` || '/';
}
