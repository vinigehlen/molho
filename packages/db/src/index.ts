import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/client/client';

export { PrismaClient, Prisma } from '../prisma/generated/client/client';
export type * from '../prisma/generated/client/client';
export * from '../prisma/generated/client/models';
export * from '../prisma/generated/client/enums';

/**
 * Cada request precisa dar `SET LOCAL app.tenant_id` (sempre) e
 * `SET LOCAL app.is_platform` (só em operação cross-tenant de ator
 * platform_*) antes de qualquer query — é o que a RLS lê. Isso é
 * responsabilidade do interceptor/middleware da API (Épico 3), não deste
 * pacote.
 */
/**
 * Conexões por INSTÂNCIA no pool do adapter. Explícito de propósito: o default
 * do node-postgres também é 10, mas herdá-lo esconde o número que realmente
 * importa — `max × nº de instâncias` contra o teto de conexão do compute Neon.
 *
 * Este pool fala pela `DATABASE_URL` **pooled** (PgBouncer do Neon, transaction
 * mode); a `DIRECT_URL` só existe pra migration e não passa por aqui.
 *
 * Hoje: 10 × 2 máquinas na `gru` = 20, folgado. Escalar instâncias (ou ligar
 * autoscale) exige revisar ESTE número — senão o teto do Neon é estourado pela
 * multiplicação, não por carga.
 */
const POOL_MAX_POR_INSTANCIA = 10;

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString, max: POOL_MAX_POR_INSTANCIA });
  return new PrismaClient({ adapter });
}

export * from './modules/module-service';
export * from './modules/module-data-source';
export * from './modules/module-cache';
export * from './modules/module-registry';
export * from './modules/module-logger';
export * from './modules/module-invalidation-extension';

export * from './crypto/phone';
export * from './crypto/email';
