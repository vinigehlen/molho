import type { PrismaClient } from '../../prisma/generated/client/client';
import type { ModuleLogger } from './module-logger';

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * tenant_entitlements/tenant_settings sempre têm tenantId no `where` (PK
 * composta) ou no `data` (create) de uma escrita singular. Escrita em massa
 * sem tenantId explícito (ex.: updateMany({ where: { moduleKey } }) afetando
 * vários tenants) não dá pra invalidar precisamente — cai pro TTL de 60s.
 */
export function extractTenantId(args: unknown): string | null {
  if (!args || typeof args !== 'object') return null;
  const a = args as {
    where?: { tenantId?: string; tenantId_moduleKey?: { tenantId?: string } };
    data?: { tenantId?: string } | Array<{ tenantId?: string }>;
  };

  if (typeof a.where?.tenantId === 'string') return a.where.tenantId;
  if (typeof a.where?.tenantId_moduleKey?.tenantId === 'string') {
    return a.where.tenantId_moduleKey.tenantId;
  }
  if (!Array.isArray(a.data) && typeof a.data?.tenantId === 'string') return a.data.tenantId;
  return null;
}

/**
 * Rede de segurança: qualquer escrita em tenant_entitlements/tenant_settings
 * (por QUALQUER caminho de código, não só o ModuleService) invalida o cache
 * daquele tenant depois de a escrita ter sucesso. feature_flags não tem
 * tenant_id — não dá pra invalidar por tenant, então só loga e deixa o TTL
 * de 60s expirar sozinho (flag muda raro, é rollout de engenharia).
 */
export function withModuleInvalidation(
  prisma: PrismaClient,
  invalidate: (tenantId: string) => Promise<void>,
  logger: ModuleLogger = { warn: () => {} },
) {
  return prisma.$extends({
    name: 'module-cache-invalidation',
    query: {
      tenantEntitlement: {
        async $allOperations({ operation, args, query }) {
          const result = await query(args);
          if (WRITE_OPERATIONS.has(operation)) {
            const tenantId = extractTenantId(args);
            if (tenantId) await invalidate(tenantId);
            else logger.warn('module_invalidation_no_tenant_id', { model: 'tenantEntitlement', operation });
          }
          return result;
        },
      },
      tenantSetting: {
        async $allOperations({ operation, args, query }) {
          const result = await query(args);
          if (WRITE_OPERATIONS.has(operation)) {
            const tenantId = extractTenantId(args);
            if (tenantId) await invalidate(tenantId);
            else logger.warn('module_invalidation_no_tenant_id', { model: 'tenantSetting', operation });
          }
          return result;
        },
      },
      featureFlag: {
        async $allOperations({ operation, args, query }) {
          const result = await query(args);
          if (WRITE_OPERATIONS.has(operation)) {
            logger.warn('module_invalidation_skipped_global_flag', { operation });
          }
          return result;
        },
      },
    },
  });
}
