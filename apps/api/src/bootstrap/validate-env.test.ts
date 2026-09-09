import { describe, expect, it } from 'vitest';
import { collectProductionEnvProblems, validateProductionEnv } from './validate-env';

/** Ambiente de produção mínimo e VÁLIDO — cada teste estraga um pedaço. */
function validProdEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://app_runtime:secret@ep-foo-bar-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require',
    REDIS_URL: 'rediss://default:tok@legible-mosquito-152891.upstash.io:6379',
    S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    S3_REGION: 'auto',
    S3_BUCKET: 'molho-uploads-prod',
    S3_ACCESS_KEY_ID: 'AK',
    S3_SECRET_ACCESS_KEY: 'SK',
    S3_PUBLIC_URL: 'https://pub-abc123.r2.dev',
    MOLHO_ENCRYPTION_KEYS: '{"1":"k"}',
    MOLHO_OTP_HMAC_KEY: 'k',
    MOLHO_EMAIL_PEPPER: 'k',
    MOLHO_JWT_SECRETS: '{"1":"k"}',
    MOLHO_CORS_ORIGINS: 'https://app.molho.live',
  };
}

describe('collectProductionEnvProblems', () => {
  it('não valida nada fora de produção', () => {
    expect(collectProductionEnvProblems({ NODE_ENV: 'development' })).toEqual([]);
    expect(collectProductionEnvProblems({})).toEqual([]);
  });

  it('aceita um ambiente de produção completo e correto', () => {
    expect(collectProductionEnvProblems(validProdEnv())).toEqual([]);
  });

  it('aceita S3_PUBLIC_URL em r2.dev (decisão PM do piloto)', () => {
    const env = validProdEnv();
    env.S3_PUBLIC_URL = 'https://pub-xyz.r2.dev';
    expect(collectProductionEnvProblems(env)).toEqual([]);
  });

  it('rejeita DATABASE_URL não-pooled', () => {
    const env = validProdEnv();
    env.DATABASE_URL = 'postgresql://app_runtime:s@ep-foo-bar.sa-east-1.aws.neon.tech/neondb';
    expect(collectProductionEnvProblems(env)).toContainEqual(expect.stringContaining('POOLED'));
  });

  it('rejeita DATABASE_URL com role dono (app_migrator / neondb_owner)', () => {
    const env = validProdEnv();
    env.DATABASE_URL = 'postgresql://app_migrator:s@ep-foo-bar-pooler.sa-east-1.aws.neon.tech/neondb';
    expect(collectProductionEnvProblems(env)).toContainEqual(expect.stringContaining('app_runtime'));
  });

  it('rejeita DATABASE_URL apontando para staging', () => {
    const env = validProdEnv();
    env.DATABASE_URL = 'postgresql://app_runtime:s@ep-staging-x-pooler.sa-east-1.aws.neon.tech/neondb';
    expect(collectProductionEnvProblems(env)).toContainEqual(expect.stringContaining('staging'));
  });

  it('rejeita REDIS_URL ausente', () => {
    const env = validProdEnv();
    delete env.REDIS_URL;
    expect(collectProductionEnvProblems(env)).toContainEqual(expect.stringContaining('REDIS_URL ausente'));
  });

  it('rejeita REDIS_URL sem TLS', () => {
    const env = validProdEnv();
    env.REDIS_URL = 'redis://localhost:6379';
    const problems = collectProductionEnvProblems(env);
    expect(problems).toContainEqual(expect.stringContaining('TLS'));
    expect(problems).toContainEqual(expect.stringContaining('localhost'));
  });

  it('rejeita credencial R2 faltando (cairia pro MockStorageProvider)', () => {
    const env = validProdEnv();
    delete env.S3_ACCESS_KEY_ID;
    expect(collectProductionEnvProblems(env)).toContainEqual(expect.stringContaining('S3_ACCESS_KEY_ID'));
  });

  it('rejeita secret de cifra/JWT faltando', () => {
    const env = validProdEnv();
    delete env.MOLHO_JWT_SECRETS;
    expect(collectProductionEnvProblems(env)).toContainEqual(expect.stringContaining('MOLHO_JWT_SECRETS'));
  });

  it('rejeita MOLHO_CORS_ORIGINS ausente, com curinga ou http', () => {
    const missing = validProdEnv();
    delete missing.MOLHO_CORS_ORIGINS;
    expect(collectProductionEnvProblems(missing)).toContainEqual(expect.stringContaining('MOLHO_CORS_ORIGINS ausente'));

    const wildcard = validProdEnv();
    wildcard.MOLHO_CORS_ORIGINS = '*';
    expect(collectProductionEnvProblems(wildcard)).toContainEqual(expect.stringContaining('curinga'));

    const http = validProdEnv();
    http.MOLHO_CORS_ORIGINS = 'http://app.molho.live';
    expect(collectProductionEnvProblems(http)).toContainEqual(expect.stringContaining('https://'));
  });

  it('rejeita MOLHO_DEBUG_PUBSUB ligado, aceita "false"/"0"/ausente', () => {
    const on = validProdEnv();
    on.MOLHO_DEBUG_PUBSUB = '1';
    expect(collectProductionEnvProblems(on)).toContainEqual(expect.stringContaining('MOLHO_DEBUG_PUBSUB'));

    for (const off of ['false', '0', undefined]) {
      const env = validProdEnv();
      if (off === undefined) delete env.MOLHO_DEBUG_PUBSUB;
      else env.MOLHO_DEBUG_PUBSUB = off;
      expect(collectProductionEnvProblems(env)).toEqual([]);
    }
  });

  it('nenhuma mensagem de erro contém o valor de um segredo', () => {
    const env = validProdEnv();
    env.DATABASE_URL = 'postgresql://app_migrator:SUPERSECRETPW@ep-foo-bar.sa-east-1.aws.neon.tech/neondb';
    const problems = collectProductionEnvProblems(env);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).not.toContain('SUPERSECRETPW');
  });
});

describe('validateProductionEnv', () => {
  it('lança listando todos os problemas de uma vez', () => {
    expect(() => validateProductionEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
  });

  it('não lança com ambiente válido nem fora de produção', () => {
    expect(() => validateProductionEnv(validProdEnv())).not.toThrow();
    expect(() => validateProductionEnv({ NODE_ENV: 'test' })).not.toThrow();
  });
});
