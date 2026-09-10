function publicUrl(name: 'NEXT_PUBLIC_SITE_URL' | 'NEXT_PUBLIC_APP_URL', localFallback: string): string {
  const raw = process.env[name] || (process.env.VERCEL_ENV === 'production' ? '' : localFallback);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} deve ser uma URL absoluta.`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} não pode conter credenciais, query ou fragmento.`);
  }
  if (process.env.VERCEL_ENV === 'production') {
    if (url.protocol !== 'https:') throw new Error(`${name} deve usar HTTPS em produção.`);
    if (/staging|\.vercel\.app$/i.test(url.hostname)) {
      throw new Error(`${name} não pode apontar para staging ou vercel.app em produção.`);
    }
  }
  return url.toString().replace(/\/$/, '');
}

export const SITE_URL = publicUrl('NEXT_PUBLIC_SITE_URL', 'http://localhost:3002');
export const APP_URL = publicUrl('NEXT_PUBLIC_APP_URL', 'http://localhost:3001');
export const SIGNUP_URL = `${APP_URL}/signup`;
export const LOGIN_URL = `${APP_URL}/login`;
