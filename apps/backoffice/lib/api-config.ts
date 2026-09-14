type Environment = Readonly<Record<string, string | undefined>>;

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

/**
 * Guarda de build: roda em next.config.ts (Node puro, nunca vai pro bundle do
 * cliente). NEXT_PUBLIC_API_URL é inlined em build time, então validar em
 * runtime no módulo não pega erro de config — isso já falha o `next build`.
 */
export function validateApiUrl(env: Environment): void {
  if (env.VERCEL_ENV !== 'production') return;

  const deployedEnvironment = env.MOLHO_ENV;
  if (deployedEnvironment !== 'staging' && deployedEnvironment !== 'production') {
    throw new Error('Deployment publicado exige MOLHO_ENV=staging ou MOLHO_ENV=production.');
  }

  const expected = deployedEnvironment === 'production' ? 'https://api.molho.live' : 'https://api.staging.molho.live';
  if (env.NEXT_PUBLIC_API_URL !== expected) {
    throw new Error(`${deployedEnvironment} exige NEXT_PUBLIC_API_URL=${expected}.`);
  }
}
