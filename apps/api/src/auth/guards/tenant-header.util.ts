import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Guards rodam ANTES de qualquer Interceptor (CLAUDE.md § Contexto de
 * request) — RequireModuleGuard/RequirePermissionGuard não podem contar com
 * o tenantId que TenantContextInterceptor só resolve DEPOIS. Cada guard lê o
 * header por conta própria (mesmo padrão já usado em JwtAuthGuard pra sua
 * própria leitura pontual de banco).
 */
export function requireTenantIdHeader(request: Request): string {
  const tenantId = request.headers['x-tenant-id'];
  if (!tenantId || Array.isArray(tenantId)) {
    throw new ForbiddenException('Header X-Tenant-Id obrigatório.');
  }
  return tenantId;
}
