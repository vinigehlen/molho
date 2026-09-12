type Environment = Readonly<Record<string, string | undefined>>;

function deployedEnvironment(env: Environment): 'staging' | 'production' | null {
  const value = env.MOLHO_ENV;
  if (value === 'staging' || value === 'production') return value;
  if (env.VERCEL_ENV === 'production') {
    throw new Error('Deployment publicado exige MOLHO_ENV=staging ou MOLHO_ENV=production.');
  }
  return null;
}

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
  const environment = deployedEnvironment(env);
  if (environment) {
    if (url.protocol !== 'https:') throw new Error('MOLHO_API_INTERNAL_URL deve usar HTTPS em produção.');
    const stagingApi = /staging/i.test(url.hostname);
    if (environment === 'production' && stagingApi) {
      throw new Error('MOLHO_API_INTERNAL_URL de produção não pode apontar para staging.');
    }
    if (environment === 'staging' && !stagingApi) {
      throw new Error('MOLHO_API_INTERNAL_URL de staging deve apontar para a API de staging.');
    }
  }
  return url.origin;
}
