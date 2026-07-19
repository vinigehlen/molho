import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Actor, type Permission, type Role, can, isRole } from '@molho/contracts';
import { requireTenantIdHeader } from './tenant-header.util';
import type { RequestWithUser } from './jwt-auth.guard';
import type { TokenScope } from '../token/token-payload';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';

/**
 * can() é puro — opera só sobre request.user.scopes (já no JWT, populado por
 * JwtAuthGuard) e o tenantId do header. Roda DEPOIS de JwtAuthGuard sempre
 * (ordem do array em @UseGuards importa: Nest roda guards na ordem
 * declarada) — sem isso request.user não existe ainda.
 *
 * Só valida escopo TENANT (cobre owner/manager/cashier.../platform_* nas
 * rotas de catálogo). scope_type='store' fica pra quando um consumidor real
 * precisar — mesma limitação já documentada em TenantContextInterceptor.
 * `requiresApproval` (△ da matriz §5-C.5) não se aplica a nenhuma das 8
 * permissões de catálogo do commit 1 — fluxo de PIN fica pro Épico do PDV.
 */
@Injectable()
export class RequirePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true; // rota sem @RequirePermission não passa por este guard, de propósito

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const tenantId = requireTenantIdHeader(request);

    // TokenScope.role é string solta (não valida contra Role no momento de
    // assinar o JWT — ver token-payload.ts); RoleAssignment.role é o union
    // estrito. Filtra em vez de castar: um token velho com nome de papel que
    // não existe mais perde só ESSA atribuição (fail-closed), não quebra a
    // request inteira.
    const actor: Actor = {
      id: request.user.sub,
      assignments: request.user.scopes
        .filter((s): s is TokenScope & { role: Role } => isRole(s.role))
        .map((s) => ({ role: s.role, scopeType: s.scopeType, scopeId: s.scopeId })),
    };
    const result = can(actor, permission, { tenantId });
    if (!result.allowed) {
      throw new ForbiddenException(`Sem permissão "${permission}" para este tenant.`);
    }
    return true;
  }
}
