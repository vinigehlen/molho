/**
 * Validação fail-fast de ambiente — roda no `main.ts` ANTES de
 * `NestFactory.create`. Um processo de produção mal configurado morre antes de
 * abrir a porta, em vez de degradar em silêncio (Redis em memória, storage
 * mock, `DATABASE_URL` sem pooler ou com role dona) e só quebrar no primeiro
 * pedido/login. Ver `docs/14-plano-zero-no-go.md` § NG-05.
 *
 * Pura e exportada (recebe `env` por parâmetro) pra ser testável sem subir o
 * app — mesmo padrão de `cors.ts` / `trust-proxy.ts`.
 *
 * REGRA: a mensagem de erro cita o NOME da variável, NUNCA o valor.
 *
 * Fora de produção não valida nada — dev/test sobem com mock/memória de
 * propósito. As guardas por-canal do `MessagingModule` (Resend/Zenvia)
 * continuam valendo e não são duplicadas aqui.
 */

/** Substrings que denunciam uma URL de staging/dev num slot de produção. */
const FORBIDDEN_URL_SUBSTRINGS = ['staging', 'localhost', 'vercel.app'];

/** Secrets que hoje só falham no 1º uso; centralizadas pra falhar já no boot. */
const REQUIRED_SECRETS = [
  'MOLHO_ENCRYPTION_KEYS',
  'MOLHO_OTP_HMAC_KEY',
  'MOLHO_EMAIL_PEPPER',
  'MOLHO_JWT_SECRETS',
] as const;

const REQUIRED_S3_VARS = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_PUBLIC_URL',
] as const;

function hasForbiddenSubstring(value: string): string | undefined {
  return FORBIDDEN_URL_SUBSTRINGS.find((s) => value.includes(s));
}

/**
 * Coleta TODOS os problemas antes de lançar — subir o Fly, ver um erro,
 * configurar, subir de novo e ver o próximo é o loop lento que isto evita.
 */
export function collectProductionEnvProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') {
    return [];
  }

  const problems: string[] = [];

  // ─── DATABASE_URL: pooled + role app_runtime ───────────────────────────────
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    problems.push('DATABASE_URL ausente.');
  } else {
    let parsed: URL | undefined;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      problems.push('DATABASE_URL não é uma URL válida.');
    }
    if (parsed) {
      if (!parsed.hostname.includes('-pooler.')) {
        problems.push(
          'DATABASE_URL deve ser a connection string POOLED do Neon (host com "-pooler"); a direta é só do job de migration.',
        );
      }
      if (parsed.username !== 'app_runtime') {
        problems.push(
          `DATABASE_URL deve conectar como o role "app_runtime" (sujeito a RLS), não "${parsed.username || '(vazio)'}".`,
        );
      }
      const forbidden = hasForbiddenSubstring(databaseUrl);
      if (forbidden) {
        problems.push(`DATABASE_URL contém "${forbidden}" — parece um recurso de staging/dev.`);
      }
    }
  }

  // ─── REDIS_URL: presente + TLS ─────────────────────────────────────────────
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    problems.push(
      'REDIS_URL ausente: sem ele a API cai para stores em memória (sessão, OTP, rate limit, pub/sub de pedido) — inconsistente entre as 2 máquinas do Fly.',
    );
  } else {
    if (!redisUrl.startsWith('rediss://')) {
      problems.push('REDIS_URL deve usar TLS ("rediss://") em produção.');
    }
    const forbidden = hasForbiddenSubstring(redisUrl);
    if (forbidden) {
      problems.push(`REDIS_URL contém "${forbidden}" — parece um recurso de staging/dev.`);
    }
  }

  // ─── Storage R2: sem credencial o StorageModule vira MockStorageProvider ───
  for (const name of REQUIRED_S3_VARS) {
    if (!env[name]) {
      problems.push(`${name} ausente: sem as credenciais R2 o StorageModule usa MockStorageProvider (uploads não sobem).`);
    }
  }

  // ─── Secrets de cifra/hash/JWT ────────────────────────────────────────────
  for (const name of REQUIRED_SECRETS) {
    if (!env[name]) {
      problems.push(`${name} ausente.`);
    }
  }

  // ─── CORS: allowlist explícita, HTTPS, sem curinga ────────────────────────
  const corsOrigins = env.MOLHO_CORS_ORIGINS;
  if (!corsOrigins) {
    problems.push('MOLHO_CORS_ORIGINS ausente: em produção o CORS credenciado precisa da allowlist explícita (ex.: https://app.molho.live).');
  } else {
    const entries = corsOrigins.split(',').map((o) => o.trim()).filter(Boolean);
    if (entries.some((o) => o.includes('*'))) {
      problems.push('MOLHO_CORS_ORIGINS não pode conter curinga ("*") — só origens exatas.');
    }
    if (entries.some((o) => !o.startsWith('https://'))) {
      problems.push('MOLHO_CORS_ORIGINS só aceita origens https:// em produção.');
    }
  }

  // ─── Pub/sub debug: vaza payload no log ──────────────────────────────────
  const debugPubsub = env.MOLHO_DEBUG_PUBSUB;
  if (debugPubsub && debugPubsub !== 'false' && debugPubsub !== '0') {
    problems.push('MOLHO_DEBUG_PUBSUB ligado em produção — vaza payload de pub/sub no log. Remova a variável.');
  }

  return problems;
}

/**
 * Lança se o ambiente de produção estiver inválido. No-op fora de produção e
 * quando tudo está certo (não imprime segredo).
 */
export function validateProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems = collectProductionEnvProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Configuração de produção inválida — a API não vai subir:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
}
