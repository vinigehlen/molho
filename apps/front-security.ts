type FrontKind = 'storefront' | 'backoffice' | 'site';
type Environment = Readonly<Record<string, string | undefined>>;

interface SecurityHeaderOptions {
  kind: FrontKind;
  env?: Environment;
}

function originFromUrl(raw: string | undefined, name: string, required: boolean, allowCredentials = false): string | null {
  if (!raw) {
    if (required) throw new Error(`${name} é obrigatória no deployment produtivo.`);
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || (!allowCredentials && (url.username || url.password))) throw new Error('invalid');
    return url.origin;
  } catch {
    throw new Error(`${name} deve ser uma URL HTTPS válida.`);
  }
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function directive(name: string, values: Array<string | null>): string {
  return `${name} ${unique(values).join(' ')}`;
}

export function buildFrontSecurityHeaders({ kind, env = process.env }: SecurityHeaderOptions) {
  const deployedProduction = env.VERCEL_ENV === 'production';
  const development = env.NODE_ENV !== 'production';
  const sentryOrigin = originFromUrl(
    env.NEXT_PUBLIC_SENTRY_DSN || env.SENTRY_DSN,
    'NEXT_PUBLIC_SENTRY_DSN',
    false,
    true,
  );
  const assetsOrigin = originFromUrl(
    env.MOLHO_ASSETS_ORIGIN,
    'MOLHO_ASSETS_ORIGIN',
    deployedProduction && kind !== 'site',
  );
  const apiOrigin = originFromUrl(
    env.NEXT_PUBLIC_API_URL,
    'NEXT_PUBLIC_API_URL',
    deployedProduction && kind === 'backoffice',
  );
  const posthogOrigin = env.NEXT_PUBLIC_POSTHOG_KEY
    ? originFromUrl(env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com', 'NEXT_PUBLIC_POSTHOG_HOST', false)
    : null;
  const googleAnalytics = env.NEXT_PUBLIC_GA_ID ? 'https://www.google-analytics.com' : null;
  const googleTagManager = env.NEXT_PUBLIC_GA_ID ? 'https://www.googletagmanager.com' : null;

  const csp = [
    directive('default-src', ["'self'"]),
    directive('base-uri', ["'self'"]),
    directive('object-src', ["'none'"]),
    directive('frame-ancestors', ["'none'"]),
    directive('form-action', ["'self'"]),
    directive('img-src', ["'self'", 'data:', 'blob:', assetsOrigin]),
    directive('font-src', ["'self'", 'data:']),
    directive('style-src', ["'self'", "'unsafe-inline'"]),
    directive('script-src', ["'self'", "'unsafe-inline'", development ? "'unsafe-eval'" : null, posthogOrigin, googleTagManager]),
    directive('connect-src', ["'self'", apiOrigin, sentryOrigin, posthogOrigin, googleAnalytics]),
    directive('media-src', ["'self'", 'blob:', assetsOrigin]),
    directive('worker-src', ["'self'", 'blob:']),
    deployedProduction ? 'upgrade-insecure-requests' : '',
    'report-uri /api/csp-report',
    'report-to csp-endpoint',
  ].filter(Boolean).join('; ');

  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
    {
      key: env.MOLHO_CSP_REPORT_ONLY === 'true' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
      value: csp,
    },
  ];

  if (env.MOLHO_ENABLE_HSTS === 'true') {
    const includeSubDomains = env.MOLHO_HSTS_INCLUDE_SUBDOMAINS === 'true' ? '; includeSubDomains' : '';
    headers.push({ key: 'Strict-Transport-Security', value: `max-age=15552000${includeSubDomains}` });
  }
  return headers;
}
