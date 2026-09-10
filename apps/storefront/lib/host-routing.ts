export const RESERVED_STOREFRONT_HOSTS = new Set([
  'www',
  'app',
  'api',
  'staging',
  'staging-app',
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface ParsedAuthority {
  hostname: string;
  port: string | null;
}

export interface StorefrontRoutingConfig {
  rootDomain: string;
  pathMode: boolean;
  technicalHost: string | null;
  technicalSlug: string | null;
}

export interface TenantResolution {
  slug: string;
  mode: 'host' | 'path' | 'technical';
}

type Environment = Readonly<Record<string, string | undefined>>;

export function isValidStorefrontSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && !RESERVED_STOREFRONT_HOSTS.has(value);
}

/** Normaliza uma authority HTTP sem aceitar sintaxe ambígua. */
export function parseAuthority(raw: string | null): ParsedAuthority | null {
  if (!raw || raw.length > 260 || /[\s,/@\\%\0]/.test(raw)) return null;

  const value = raw.toLowerCase().replace(/\.$/, '');
  const match = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(value);
  if (!match) return null;

  const hostname = match[1]!;
  const port = match[2] ?? null;
  if (port && (Number(port) < 1 || Number(port) > 65_535)) return null;
  if (hostname.length > 253) return null;

  const labels = hostname.split('.');
  if (labels.some((label) => !HOST_LABEL_PATTERN.test(label))) return null;
  return { hostname, port };
}

export function normalizeRootDomain(raw: string): string | null {
  const parsed = parseAuthority(raw);
  return parsed?.port ? null : (parsed?.hostname ?? null);
}

export function resolveTenant(
  authority: string | null,
  pathname: string,
  config: StorefrontRoutingConfig,
): TenantResolution | null {
  const parsed = parseAuthority(authority);
  if (!parsed) return null;

  const rootDomain = normalizeRootDomain(config.rootDomain);
  if (!rootDomain) return null;

  const suffix = `.${rootDomain}`;
  if (parsed.hostname.endsWith(suffix)) {
    const slug = parsed.hostname.slice(0, -suffix.length);
    if (!slug.includes('.') && isValidStorefrontSlug(slug)) {
      return { slug, mode: 'host' };
    }
    return null;
  }

  if (config.technicalHost && config.technicalSlug) {
    const technicalHost = parseAuthority(config.technicalHost)?.hostname;
    if (technicalHost === parsed.hostname && isValidStorefrontSlug(config.technicalSlug)) {
      return { slug: config.technicalSlug, mode: 'technical' };
    }
  }

  if (config.pathMode) {
    const [slug] = pathname.replace(/^\/+/, '').split('/');
    if (slug && isValidStorefrontSlug(slug)) return { slug, mode: 'path' };
  }

  return null;
}

export function publicBaseUrl(
  protocol: string,
  authority: string,
  resolution: TenantResolution,
): string | null {
  const parsed = parseAuthority(authority);
  if (!parsed || (protocol !== 'http:' && protocol !== 'https:')) return null;
  const port = parsed.port ? `:${parsed.port}` : '';
  const base = `${protocol}//${parsed.hostname}${port}`;
  return resolution.mode === 'path' ? `${base}/${resolution.slug}` : base;
}

export function storefrontRoutingConfig(env: Environment = process.env): StorefrontRoutingConfig {
  const productionDeployment = env.VERCEL_ENV === 'production';
  const rootDomain = env.MOLHO_STOREFRONT_ROOT_DOMAIN || (productionDeployment ? '' : 'molho.localhost');
  const technicalHost = env.VERCEL_URL || null;
  const technicalSlug = env.MOLHO_STOREFRONT_TECHNICAL_SLUG || null;
  const pathMode = env.MOLHO_STOREFRONT_PATH_MODE
    ? env.MOLHO_STOREFRONT_PATH_MODE === 'true'
    : !productionDeployment && env.NODE_ENV !== 'production';

  if (!normalizeRootDomain(rootDomain)) {
    throw new Error('MOLHO_STOREFRONT_ROOT_DOMAIN deve ser um domínio válido.');
  }
  if (productionDeployment && rootDomain !== 'molho.live') {
    throw new Error('Produção exige MOLHO_STOREFRONT_ROOT_DOMAIN=molho.live.');
  }
  if (productionDeployment && pathMode) {
    throw new Error('MOLHO_STOREFRONT_PATH_MODE não pode ser ligado em produção.');
  }
  if (productionDeployment && (!technicalSlug || !isValidStorefrontSlug(technicalSlug))) {
    throw new Error('Produção exige MOLHO_STOREFRONT_TECHNICAL_SLUG válido para testar a URL técnica.');
  }

  return { rootDomain, pathMode, technicalHost, technicalSlug };
}
