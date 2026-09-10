type Environment = Readonly<Record<string, string | undefined>>;

export function internalApiOrigin(env: Environment = process.env): string {
  const raw = env.MOLHO_API_INTERNAL_URL || (env.VERCEL_ENV === 'production' ? '' : 'http://localhost:3333');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('MOLHO_API_INTERNAL_URL deve ser uma URL absoluta.');
  }

  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('MOLHO_API_INTERNAL_URL deve conter somente a origem da API.');
  }
  if (env.VERCEL_ENV === 'production') {
    if (url.protocol !== 'https:') throw new Error('MOLHO_API_INTERNAL_URL deve usar HTTPS em produção.');
    if (/staging/i.test(url.hostname)) throw new Error('MOLHO_API_INTERNAL_URL não pode apontar para staging.');
  }
  return url.origin;
}
