import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/client/client';

export { PrismaClient } from '../prisma/generated/client/client';
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
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export * from './modules/module-service';
export * from './modules/module-data-source';
export * from './modules/module-cache';
export * from './modules/module-registry';
export * from './modules/module-logger';
export * from './modules/module-invalidation-extension';

export * from './crypto/phone';
