const SENSITIVE_KEY = /(?:address|authorization|body|cookie|customer|data|email|otp|password|phone|pix|recipient|secret|token)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]*\d{4}/g;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~-]+/gi;

function scrubString(value: string): string {
  let scrubbed = value.replace(BEARER, 'Bearer [token]').replace(JWT, '[token]').replace(EMAIL, '[email]').replace(PHONE, '[phone]');
  if (/^https?:\/\//i.test(scrubbed)) {
    try {
      const url = new URL(scrubbed);
      url.search = '';
      url.hash = '';
      url.pathname = url.pathname
        .replace(/(\/acompanhar\/)[^/]+/i, '$1[token]')
        .replace(/(\/track\/)[^/]+/i, '$1[token]');
      scrubbed = url.toString();
    } catch {
      // Mantém a versão já filtrada quando não for uma URL completa válida.
    }
  }
  return scrubbed;
}

function scrubValue(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (typeof value === 'string') return scrubString(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => scrubValue(item, '', seen));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      scrubValue(childValue, childKey, seen),
    ]),
  );
}

export function scrubSentryEvent<T>(event: T): T {
  return scrubValue(event) as T;
}

export function scrubSentryBreadcrumb<T>(breadcrumb: T): T {
  return scrubValue(breadcrumb) as T;
}
